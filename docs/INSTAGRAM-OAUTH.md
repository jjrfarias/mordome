# Conectar Instagram sem token manual

O cliente entra em **Configurações → TV / Stories → Conectar Instagram**, autoriza
na Meta e confirma a conta que pertence à loja. O aplicativo Meta é do Mordomê;
os clientes não criam aplicativos nem copiam tokens. A loja fica vinculada à
tentativa inicial, mesmo se outra aba mudar a unidade ativa da sessão.

## Configuração do proprietário do Mordomê

No aplicativo Meta pertencente ao portfólio empresarial do Mordomê, abra
**Use cases → Manage messaging & content on Instagram → Customize → API setup
with Unified login**. Esse fluxo usa **Facebook Login for Business**, permite
entrar com Instagram ou Facebook e entrega um **System-user access token (SUAT)**.
Não confundir com o produto separado Instagram Login e seu ID/chave próprios.

1. Crie ou selecione uma configuração com selo **Instagram Login Compatible**.
2. Selecione o ativo Instagram e as permissões necessárias para leitura do
   perfil/stories. `instagram_basic` é usado na descoberta; `business_management`
   é necessário para gerenciamento/renovação dos tokens. Remova permissões de
   publicação, anúncios, mensagens e comentários que a configuração permitir
   remover: o Mordomê não usa essas operações. Se a Meta exigir permissões extras
   no modelo, revisar o consentimento e a revisão do app antes de liberar clientes.
3. Cadastre exatamente este URI OAuth (sem barra final):
   `https://mordome.jordaoconsultoria.com/api/integrations/instagram/callback`.
4. Configure no serviço web do Railway `META_APP_ID`, `META_APP_SECRET` e
   `META_INSTAGRAM_CONFIG_ID`. Use o ID/chave do **app Meta**, não do produto
   Instagram nem do Google Cast. Não versionar nem compartilhar a chave no chat.
5. `AUTH_PUBLIC_URL` deve ser o domínio canônico HTTPS; `CUSTOMER_AUTH_SECRET`
   deve ter pelo menos 32 caracteres e permanecer estável para decifrar conexões.
6. Adicione/autorize a própria conta profissional como testadora e faça um teste
   real de consentimento, escolha da conta e leitura de stories ativos.
7. Para contas de clientes externos, concluir a verificação/revisão exigida pela
   Meta, obter Advanced Access para as permissões da configuração e colocar o
   aplicativo em Live. Configurar os requisitos de privacidade, exclusão de dados
   e webhooks pedidos pelo painel com dados reais do operador. Este código não
   substitui essa aprovação nem declara que ela foi obtida.

Sem as credenciais, o cliente vê “A conexão com o Instagram está sendo preparada
pelo Mordomê”. O campo de token não aparece. Fotos/vídeos enviados continuam
funcionando. A API antiga de token manual permanece para compatibilidade técnica,
mas não faz parte da interface do cliente.

## Fluxo e segurança

- `POST /api/admin/tv/instagram/authorize`: exige sessão, permissão, loja e origem
  canônica; gera estado aleatório de 256 bits, armazenado como hash, vinculado ao
  hash da sessão, usuário, organização e loja, com validade de dez minutos.
- Callback: valida novamente sessão/permissões e consome o estado atomicamente;
  troca o código no servidor, busca portfólio/system user e contas autorizadas.
  Token cifrado fica temporariamente no banco, nunca no navegador ou resposta.
- `/configuracoes/instagram`: lista somente contas compartilhadas pela autorização
  daquela sessão. A confirmação explícita valida perfil e leitura de `/stories`
  antes de salvar a conexão. Cancelar/erro não substitui conexão existente.
- Nova tentativa invalida a anterior. Desconectar elimina tentativas pendentes.
  Tentativas expiradas são removidas ao iniciar novos fluxos.
- Resultado do callback usa URL sem código, estado, token ou erro da Meta,
  com `no-store` e `no-referrer`. Não habilitar logs de query strings/proxy/analytics
  nesse callback nem logs das chamadas de troca de código.
- Conexão salva também guarda `client_business_id`, system user, `config_id` e
  expiração quando informada. A configuração SUAT pode usar token sem expiração;
  isso não impede revogação pelo cliente/Meta.
- Com expiração, tenta renovação nos sete dias finais, durante a atualização da
  programação, no máximo uma vez por hora. Solicita token de 60 dias usando
  `appsecret_proof`, autorização Bearer e `business_management`. Não existe cron
  independente: uma loja sem acesso por todo o prazo pode precisar reconectar.
- Autorização expirada/revogada interrompe novas tentativas e pede reconexão.
  Conteúdo em cache ainda válido pode permanecer até vencer; arquivos enviados
  não dependem da Meta. Desconectar no Mordomê apaga o acesso local; remover o app
  do portfólio Meta revoga a autorização externa.

## Validação e limites

O teste `tests/integration/tv/smoke.mjs` usa PostgreSQL descartável e Meta simulada
para autorização, isolamento, replay, concorrência, cancelamento, expiração,
renovação e revogação. Isso não comprova aprovação externa nem leitura real.
Nem todo story é disponibilizado pela Meta, por exemplo certos vídeos com áudio
licenciado; ausência de `media_url` faz o item ser ignorado pelo player.

## Referências oficiais consultadas

- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication
- https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business#bisu-token-api
- https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/stories
