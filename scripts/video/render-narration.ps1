$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$root = Join-Path (Get-Location) "artifacts\videos"
$tracks = @{
  "saas" = @(
    "Um restaurante funciona em muitos lugares ao mesmo tempo. No balcão, nas mesas, na cozinha, no delivery e na administração. O Mordomê conecta tudo em uma única plataforma.",
    "Após a contratação, o proprietário recebe seu acesso, configura a empresa, cria as unidades e prepara a operação de forma simples e guiada.",
    "Cada cliente pode administrar vários estabelecimentos, com cardápios, preços, estoques, caixas, equipes e resultados separados por unidade.",
    "No P D V, a venda acontece em poucos toques. Produtos, adicionais, observações, descontos autorizados, identificação do cliente e diferentes formas de pagamento.",
    "No salão, as mesas são organizadas por área e responsável. O atendente abre comandas, lança pedidos, acompanha rodadas, transfere mesas e divide ou fecha a conta.",
    "Os pedidos seguem automaticamente para cada praça de preparo. A cozinha acompanha prioridades e etapas, enquanto impressoras locais recebem comandas e comprovantes.",
    "O mesmo catálogo alimenta o cardápio digital, pedidos para retirada, delivery próprio e integrações com plataformas externas, sem duplicar cadastros.",
    "Cada venda pode consumir automaticamente ingredientes, bebidas e embalagens. Fichas técnicas controlam quantidades, rendimento, perdas, custos e produção em lote.",
    "Entradas, inventários, estoque mínimo e transferências entre unidades mantêm a operação abastecida e totalmente rastreável.",
    "Caixa, Pix, cartões, T E F, emissão fiscal, sangrias, suprimentos, reembolsos e conciliação financeira trabalham de forma integrada.",
    "E se a internet cair? Com Nuvem mais Local, P D V, salão, cozinha, caixa e impressão continuam na rede interna. Quando a conexão volta, tudo é sincronizado.",
    "Online ou offline. Mordomê. Toda a operação em um só lugar."
  )
  "betao" = @(
    "Uma história construída em família merece uma operação preparada para continuar crescendo.",
    "O Mordomê ganhou uma experiência exclusiva para a Família Betão, com identidade, cores e linguagem próprias.",
    "No balcão, hot dogs, bebidas, porções e adicionais ficam prontos para uma venda rápida, organizada e segura.",
    "No salão, cada pedido conecta mesa, atendente e cozinha, seguindo diretamente para a praça responsável.",
    "O mesmo cardápio atende balcão, mesas, retirada e delivery em todas as unidades.",
    "Mesmo sem internet, a Família Betão continua atendendo. Quando a conexão volta, o Mordomê sincroniza tudo.",
    "Mordomê para Família Betão. Tradição para servir. Tecnologia para crescer."
  )
}

foreach ($variant in $tracks.Keys) {
  $outputDir = Join-Path $root "$variant\narration"
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  $index = 1
  foreach ($line in $tracks[$variant]) {
    $file = Join-Path $outputDir (("{0:D2}.wav" -f $index))
    $voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $voice.SelectVoice("Microsoft Maria Desktop")
    $voice.Rate = 0
    $voice.Volume = 100
    $voice.SetOutputToWaveFile($file)
    $voice.Speak($line)
    $voice.Dispose()
    Write-Output "$variant/$index"
    $index++
  }
}
