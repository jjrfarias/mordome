param([string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'), [switch]$Once)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$windowsPrinter = -not [string]::IsNullOrWhiteSpace($config.printerName)
if ($windowsPrinter) { . (Join-Path $PSScriptRoot 'kitchen-print-windows.ps1') }
$base = Split-Path -Parent $ConfigPath
$journal = Join-Path $base 'journal'
New-Item -ItemType Directory -Force $journal | Out-Null
$mutex = [Threading.Mutex]::new($false, 'Local\MordomeKitchenPrinter')
if (-not $mutex.WaitOne(0)) { exit 0 }
function Log([string]$message) {
  $path = Join-Path $base 'agent.log'
  if ((Test-Path $path) -and (Get-Item $path).Length -gt 2MB) { Move-Item -LiteralPath $path -Destination ($path + '.old') -Force }
  Add-Content -LiteralPath $path -Value ("{0:o} {1}" -f (Get-Date), $message)
}
function Api([string]$method, $body) {
  $args = @{ Uri = ($config.url.TrimEnd('/') + '/api/integrations/kitchen-print'); Method = $method; Headers = @{ Authorization = "Bearer $token" }; TimeoutSec = 20 }
  if ($body) { $args.ContentType = 'application/json'; $args.Body = ($body | ConvertTo-Json -Compress) }
  Invoke-RestMethod @args
}
try {
  $secret = Import-Clixml -LiteralPath (Join-Path $base 'token.xml')
  $token = [Net.NetworkCredential]::new('', $secret).Password
  if ([uri]$config.url -and -not $config.url.StartsWith('https://')) { throw 'HTTPS obrigatorio.' }
  Log 'Agente iniciado.'
  do {
    try {
      # A failed ACK only retries the acknowledgement, never the physical print.
      foreach ($record in Get-ChildItem -LiteralPath $journal -Filter '*.sent') {
        $null = Api 'POST' @{ jobId = $record.BaseName; action = 'ACK' }
        Remove-Item -LiteralPath $record.FullName
      }
      $queue = Api 'GET' $null
      if ($queue.uncertain -gt 0) { Log ("ATENCAO: {0} comanda(s) com envio incerto; conferir antes de reimprimir." -f $queue.uncertain) }
      foreach ($job in $queue.jobs) {
        if ($job.id -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Identificador invalido.' }
        $port = $null
        $printer = $null
        try {
          # Open the selected transport before claiming; never auto-fallback after a send.
          if ($windowsPrinter) {
            $printer = New-Object MordomeRawPrinter -ArgumentList $config.printerName
          } else {
            $port = [IO.Ports.SerialPort]::new($config.port, 9600, [IO.Ports.Parity]::None, 8, [IO.Ports.StopBits]::One)
            $port.WriteTimeout = 5000
            $port.Open()
          }
          try { $ticket = Api 'POST' @{ jobId = $job.id; action = 'CLAIM' } }
          catch {
            if ($_.Exception.Response.StatusCode.value__ -eq 409) { Log ("Comanda {0} requer conferencia ou ja reservada." -f $job.id); continue }
            throw
          }
          $pending = Join-Path $journal ($job.id + '.sending')
          [IO.File]::WriteAllText($pending, (Get-Date).ToUniversalTime().ToString('o'))
          $bytes = [Convert]::FromBase64String($ticket.payload)
          if ($windowsPrinter) {
            $spoolId = $printer.Send($bytes, ('Mordome - ' + $job.id))
            Log ("Comanda {0} aceita pelo spooler {1}, trabalho {2}." -f $job.id, $config.printerName, $spoolId)
          } else {
          $port.Write($bytes, 0, $bytes.Length)
          # Let the serial driver drain before closing; write success is not paper confirmation.
          $deadline = (Get-Date).AddSeconds(15)
          while ($port.BytesToWrite -gt 0) {
            if ((Get-Date) -gt $deadline) { throw 'Tempo esgotado ao enviar para impressora.' }
            Start-Sleep -Milliseconds 100
          }
          }
          Move-Item -LiteralPath $pending -Destination (Join-Path $journal ($job.id + '.sent'))
          $destination = if ($windowsPrinter) { $config.printerName } else { $config.port }
          Log ("Comanda {0} enviada para {1}." -f $job.id, $destination)
          $null = Api 'POST' @{ jobId = $job.id; action = 'ACK' }
          Remove-Item -LiteralPath (Join-Path $journal ($job.id + '.sent'))
        } finally {
          if ($null -ne $port) { if ($port.IsOpen) { $port.Close() }; $port.Dispose() }
          if ($null -ne $printer) { $printer.Dispose() }
        }
      }
    } catch { Log ("Falha: " + $_.Exception.Message) }
    if (-not $Once) { Start-Sleep -Seconds 3 }
  } while (-not $Once)
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
