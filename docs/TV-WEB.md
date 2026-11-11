# TV pelo navegador

O caminho principal dispensa Google Cast e cadastro do aparelho no Google.

## Computador conectado à TV

Em Configurações → TV / Stories, selecione a loja e clique em **Abrir tela no
computador**. Arraste a aba/janela para o monitor da TV e use **Tela cheia**.
A página exige o login do operador e mantém a unidade selecionada ao abrir.

## Navegador da própria TV

1. Abra `https://mordome.jordaoconsultoria.com/tv` na TV.
2. Leia o QR code com a câmera do celular. Ele abre a ativação no Mordomê.
3. Entre, se necessário, confira o código da tela, escolha a loja e dê um nome à TV.
4. Confirme **Ativar transmissão nesta TV**. O player abre automaticamente.

Como alternativa à câmera, use **Ativar TV pelo código** no painel e digite os
dez caracteres mostrados na TV. O código expira em dez minutos.
Ao reabrir `/tv` no mesmo navegador, a vinculação é lembrada enquanto os cookies
forem mantidos. Se o acesso for revogado, a tela oferece configuração novamente.
O painel lista as TVs vinculadas e permite revogação. Links diretos anteriores
continuam funcionando.

É necessário navegador compatível na TV e internet. Som e tela cheia podem
exigir um clique pelo controle, conforme o navegador. O player começa sem som
por padrão. Não há promessa de funcionamento offline ou de compatibilidade
com todo navegador embarcado: validar fotos, vídeos e controle na TV real.

## Segurança e implantação

A migração `20261111010000_tv_pairing` cria `TvPairing`. A emissão pública gera
um código de aprovação de 40 bits e um segredo independente de 256 bits,
ambos persistidos apenas como hashes. O segredo fica em cookie HttpOnly no
aparelho. O QR code contém somente o código de aprovação, no fragmento da URL.
A aprovação exige sessão, `integrations.manage`, unidade autorizada e origem
válida; é auditada e consumida uma única vez em transação. O celular não recebe
a credencial da TV. A TV consulta a aprovação a cada três segundos e recebe o
cookie de mídia restrito à sua TV. Dados expirados são removidos na emissão de
novos códigos. A limitação de tentativas é por processo, como nos endpoints de
autenticação existentes; os códigos têm expiração e consumo atômico no banco.

O identificador lembrado em `/tv` não autoriza acesso por si só. Playlist e mídia
continuam validando o cookie secreto, aparelho, loja e organização ativos.
O teste `node tests/integration/tv/smoke.mjs` verifica aprovação concorrente,
expiração, revogação, cookies, origem e isolamento em PostgreSQL descartável.
