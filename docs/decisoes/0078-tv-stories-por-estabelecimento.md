# ADR 0078 — TV / Stories por estabelecimento

- Data: 10/11/2026
- Decisão: integrar a programação de TV ao Mordomê, com sessão, permissões e unidade existentes.

## Uso

O painel fica em **Configurações → TV / Stories**, para quem tem `integrations.manage`.
Cada estabelecimento possui conexão Instagram, arquivos, identidade da TV e programação
independentes. Logo e cor partem dos cadastros da unidade/organização; nome de exibição,
frase, perfil Instagram e cor podem ser personalizados para aquela TV/loja.

Fotos e vídeos próprios podem ser usados sem conectar o Instagram. A programação reúne
conteúdo habilitado, com seleção de todas as fontes, somente Instagram ou somente arquivos.
Imagens usam duração configurável; vídeos avançam ao terminar. O player mantém o loop,
oferece tela cheia, pausa, navegação e som, e começa silenciado por padrão para permitir
reprodução automática. Wake Lock é solicitado quando suportado. Uma falha de mídia é
pulada temporariamente e tentada novamente; falha de rede preserva a programação já
carregada, sem prometer disponibilidade offline de arquivos ainda não baixados.

A prévia `/tv?establishmentId=...` exige sessão administrativa. A programação fica presa
à unidade explícita, mesmo se outra aba trocar a unidade ativa da sessão.

## TVs dedicadas

O fluxo principal agora é abrir `/tv` e ativar pelo QR code no celular, com
login e escolha explícita da loja. Veja [TV pelo navegador](../TV-WEB.md).
O fluxo de link direto abaixo permanece disponível como alternativa.

O administrador cria um acesso por aparelho e recebe `/tv/<id>#token=...`. O token aleatório
aparece uma vez e só seu SHA-256 é persistido. O fragmento não é enviado no endereço HTTP;
o player o troca por cookie HttpOnly, Secure em produção, SameSite=Strict e restrito
às APIs daquela TV, e remove o fragmento após a troca. Não usa localStorage/sessionStorage.

A página dedicada entrega apenas a estrutura visual antes da autenticação. Playlist e
mídia validam dispositivo, unidade e organização ativos em cada consulta. A credencial
não permite administrar o Mordomê. Revogar o acesso bloqueia novas consultas; o player
limpa o conteúdo quando recebe a negativa no polling. O intervalo normal é de 60 segundos.
Conteúdo já entregue a um navegador desconectado não pode ser revogado retroativamente.

## Persistência e isolamento

`TvConfig`, `TvMedia`, `TvStoryPreference` e `TvDisplay` pertencem ao estabelecimento.
Todas as APIs administrativas verificam sessão, `integrations.manage`, organização,
unidade autorizada e origem nas escritas. Alterações administrativas são auditadas.
Não se usa o usuário criador como proprietário exclusivo da programação.

Arquivos ficam em bucket S3 privado do projeto Railway; Prisma armazena os metadados.
O serviço web transmite a mídia por endpoints autenticados com GET/HEAD e suporte
a um intervalo HTTP Range. O bucket não tem URL pública nem credenciais no navegador.
A CSP central libera imagens/vídeos somente dos domínios de mídia Instagram previstos.

Limites: JPG, PNG, WebP, MP4 e WebM; 30 MB por arquivo, até 100 arquivos e 1 GB por unidade.
Além de tipo/tamanho, o servidor confere a assinatura do arquivo. A reserva de quota usa
trava transacional na unidade e `ready=false`, incluindo uploads concorrentes no cálculo.
Somente arquivos finalizados entram na programação. Falhas anteriores à finalização
desfazem arquivo e reserva. Se a confirmação do commit ficar incerta, o objeto é
preservado para não apagar mídia já publicada; uma reserva ainda pendente é limpa
gradualmente após uma hora, no próximo envio.

## Instagram

A conexão é opcional e exige autorização real da conta profissional. O painel permite
descoberta pelo login unificado (`me/assigned_instagram_accounts`) ou pelo fluxo com
Página do Facebook (`me/accounts`), e seleção explícita quando há várias contas.
O servidor confirma perfil **e leitura de `/stories`** antes de salvar a conexão.
Uma interface configurada ou um perfil acessível não significam que a Meta autorizou stories.

O token é cifrado com AES-256-GCM, IV aleatório, chave derivada de `CUSTOMER_AUTH_SECRET`
com domínio próprio `mordome:tv:v1` e AAD do estabelecimento. Não fica no JSON das
integrações genéricas, em respostas, logs, links ou armazenamento do navegador.
Versão Graph configurável por `META_GRAPH_VERSION`, padrão `v25.0`.

Atualização no máximo uma vez por minuto por loja, com lease atômico entre processos.
Falhas preservam apenas stories ainda válidos. Expiração em 24 horas é aplicada no
servidor e continuamente no player. URLs upstream são validadas; paginação usa cursores
no host Graph fixo, sem seguir URLs/redirects que possam receber o token.

O módulo não cria aplicativo/portfólio Meta nem conclui consentimento do titular.
Não há renovação automática de autorização nesta entrega. A disponibilidade de APIs,
escopos e revisão do aplicativo depende da Meta; qualquer acesso negado é explicado
com mensagem segura no painel e requer reconectar/configurar a autorização.

## Validação

O gate final `npm run build` passou no checkout da aplicação: lint sem erros,
368 testes aprovados, schema Prisma válido, geração do cliente, TypeScript e build
de produção do Next concluídos. A suíte rápida inclui quatro testes de TV para
assinaturas de mídia, intervalos HTTP e expiração exata dos stories em cache.

A validação de integração passou 16 grupos de verificações, com PostgreSQL 18.6
local, todas as migrations e requisições HTTP às rotas reais. Foram usadas duas
organizações, três unidades e usuários com diferentes permissões. A cobertura inclui
isolamento e troca de unidade, origem das escritas, cookies e revogação das TVs,
upload/HEAD/Range, exclusão, quota concorrente, criptografia e ausência de segredos
nas respostas, validação de Stories antes de conectar, cache e lease de atualização.

Meta e S3 foram simulados nessa suíte. O SDK S3 foi exercitado contra um servidor
local; esse resultado não comprova credenciais do bucket de produção nem autorização
real da Meta. A conta Instagram precisa ser autorizada para validar o fluxo externo.

O harness reexecutável e suas dependências ficam em `tests/integration/tv`, separados
das dependências da aplicação. Com as dependências da raiz instaladas, execute:

```sh
npm --prefix tests/integration/tv ci
node tests/integration/tv/smoke.mjs
```

O script cria e descarta seu próprio PostgreSQL, não reutiliza o `DATABASE_URL` do
usuário e recusa `NODE_ENV=production` ou um lock ativo do Next neste checkout.
Use um usuário comum, as portas locais 47620–47622 livres e nenhum `next dev` no
mesmo checkout. Os detalhes e a localização dos logs estão no
[README do teste](../../tests/integration/tv/README.md).

A conferência visual usou uma compilação de produção em cópia isolada, com dados
de demonstração em memória. Foram verificados o painel dentro de Configurações,
o salvamento de ajustes, ativação/desativação de conteúdo, pausa/retomada e tela
cheia. As rotas exclusivas dessa demonstração não fazem parte do produto.

## Implantação

Migration aditiva `20261110120000_tv_stories`, aplicada pelo fluxo existente de pre-deploy.
Bucket privado `mordome-tv` no projeto Mordomê, região `ams`.
As seis variáveis `TV_S3_*` estão descritas em `.env.example`; credenciais devem usar
referências Railway ao bucket. A integração Instagram usa o segredo de servidor já
existente, com derivação separada da autenticação de clientes/WhatsApp.

Não existe migração de dados do protótipo independente: nenhuma conta Instagram havia
sido autorizada nele. O módulo não depende de ChatGPT Auth, D1, R2 ou daquele site.
