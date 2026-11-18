export function buildKitchenPrinterInstaller(url: string, token: string) {
  if (!/^https:\/\/[^'\r\n]+$/.test(url) || !/^[a-f0-9]{64}$/.test(token)) throw new Error("Configuração inválida.");
  return `# Mordomê - instalar impressão da cozinha no Windows
$ErrorActionPreference = 'Stop'
$base = Join-Path $env:LOCALAPPDATA 'Mordome\\ImpressoraCozinha'
$taskName = 'Mordome - Impressora da Cozinha'
$legacy = Join-Path $env:LOCALAPPDATA 'Mordome\\KitchenPrinter'
Write-Host 'Impressoras disponíveis:'
$printers = @(Get-Printer | Where-Object { $_.Name } | Sort-Object Name)
if (-not $printers.Count) { Write-Host 'Nenhuma fila Windows encontrada. Você pode informar uma porta serial.' }
for ($i = 0; $i -lt $printers.Count; $i++) { Write-Host ("{0}. {1}" -f ($i + 1), $printers[$i].Name) }
$choice = Read-Host 'Número da impressora (Enter para configurar porta serial)'
$printerName = $null
$port = $null
if ($choice) {
  $number = 0
  if (-not [int]::TryParse($choice, [ref]$number) -or $number -lt 1 -or $number -gt $printers.Count) { throw 'Número inválido.' }
  $printerName = $printers[$number - 1].Name
} else {
  $port = Read-Host 'Porta serial, por exemplo COM3'
  if ($port -notmatch '^COM[0-9]{1,3}$') { throw 'Porta serial inválida.' }
}
New-Item -ItemType Directory -Force -Path $base | Out-Null
$existing = Join-Path $base 'config.json'
# Stop only Mordomê print agents for this Windows user. They share one mutex;
# leaving the old process running would prevent the new agent from starting.
foreach ($name in @($taskName, 'Mordome Kitchen Printer')) {
  $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if ($task) { Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue }
}
$paths = @((Join-Path $base 'kitchen-print-agent.ps1'), (Join-Path $legacy 'agent.ps1'))
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object {
  $command = $_.CommandLine
  $command -and ($paths | Where-Object { $command.Contains($_) })
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
if (Test-Path (Join-Path $legacy 'journal')) {
  $uncertain = @(Get-ChildItem (Join-Path $legacy 'journal') -File -ErrorAction SilentlyContinue)
  if ($uncertain.Count) { Write-Warning 'Há registros antigos no diário de impressão. Confira-os antes de reimprimir comandas.' }
}
$source = '${url}/print-agent'
foreach ($file in @('kitchen-print-agent.ps1', 'kitchen-print-windows.ps1')) {
  Invoke-WebRequest -Uri "$source/$file" -OutFile (Join-Path $base $file)
}
$secret = ConvertTo-SecureString '${token}' -AsPlainText -Force
$secret | Export-Clixml -LiteralPath (Join-Path $base 'token.xml')
$settings = @{ url = '${url}'; printerName = $printerName; port = $port }
$settings | ConvertTo-Json | Set-Content -LiteralPath $existing -Encoding UTF8
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -File "' + (Join-Path $base 'kitchen-print-agent.ps1') + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$taskSettings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -StartWhenAvailable
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $taskSettings -Force | Out-Null
if (Get-ScheduledTask -TaskName 'Mordome Kitchen Printer' -ErrorAction SilentlyContinue) { Disable-ScheduledTask -TaskName 'Mordome Kitchen Printer' | Out-Null }
Start-ScheduledTask -TaskName $taskName
Write-Host "Instalação concluída. Arquivos: $base"
Write-Host 'Confira o último contato no painel do Mordomê. O Windows precisa permanecer ligado e com este usuário conectado.'
`;
}
