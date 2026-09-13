# Segurança — regras para toda criação nova

Este documento registra os padrões de segurança já validados no sistema
(headers, autenticação, tratamento de erro) para que qualquer tela, API ou
integração nova criada daqui pra frente siga o mesmo nível, em vez de
reintroduzir problemas já resolvidos numa revisão de segurança anterior.

## Cabeçalhos e CSP

- Todo cabeçalho de segurança fica centralizado em `next.config.ts`
  (`Content-Security-Policy`, `X-Frame-Options`, `Permissions-Policy`,
  `Strict-Transport-Security`, `X-Content-Type-Options`,
  `poweredByHeader: false`). Nenhuma tela deve desligar ou contornar isso
  individualmente.
- Sempre que uma tela nova precisar carregar um recurso externo (mapa,
  fonte, script de terceiro, chamada de API externa), adicione o host
  exato na diretiva certa da CSP (`img-src`, `connect-src`, `script-src`
  etc.) em vez de abrir a política de forma genérica. Foi assim que o
  mapa de entrega (OpenStreetMap/Leaflet/OSRM) foi integrado: hosts
  específicos foram adicionados, nunca um curinga amplo.
- Se uma feature nova precisar de uma permissão de navegador (câmera,
  microfone, geolocalização), ajuste `Permissions-Policy` para liberar
  explicitamente `(self)` — nunca deixe a policy bloqueando algo que a
  própria aplicação usa (isso já aconteceu com geolocalização e quebrou
  silenciosamente o rastreio de entrega até ser encontrado nesta revisão).

## Entrada e erro

- Toda rota de API valida o corpo da requisição com Zod antes de tocar no
  banco. Nunca confie em campos vindos do cliente sem schema.
- Erros retornados ao cliente são sempre mensagens genéricas
  (`{ error: "..." }`), nunca stack trace, nunca detalhe interno. Um 400
  de validação e um 500 inesperado não devem vazar qual campo ou qual
  exceção ocorreu além do necessário para o usuário corrigir a entrada.
- Nunca use `dangerouslySetInnerHTML` para renderizar conteúdo que veio de
  um usuário (nome de cliente, observação, endereço etc.) — o React já
  escapa texto por padrão; abrir mão disso reintroduz XSS armazenado.

## Autenticação e autorização

- Toda rota de API que não é pública verifica a sessão e a permissão
  específica no servidor — nunca confie apenas em esconder um botão ou
  item de menu na interface. Um `canFazerX` no frontend é conveniência de
  UX, a checagem que importa é a do backend.
- Rotas públicas (sem login) — como o cardápio online e o pedido online —
  devem ser criadas conscientemente como públicas, nunca por esquecimento
  de checagem de sessão. Documente no código por que a rota é pública.
- Nunca confie em cabeçalhos controláveis pelo cliente (`X-Forwarded-For`,
  `Origin` sem outras defesas) como única barreira de segurança. Rate
  limit por IP é uma camada extra, não a proteção principal — a
  autenticação e a validação de permissão é que protegem de verdade.
- Toda rota sensível a abuso automatizado (login, criação de pedido
  público, qualquer coisa alcançável sem sessão) precisa de rate limit
  (`lib/rate-limit.ts`), como já existe no login e no pedido online.

## Cookies e segredos

- O cookie de sessão é sempre `httpOnly`, `secure` em produção e
  `sameSite`. Nunca armazene token de sessão ou dado sensível em
  `localStorage`/`sessionStorage` — eles são legíveis por qualquer script
  que rode na página.
- Nunca logue senha, token, hash ou segredo no console do servidor nem do
  navegador — nem em `console.log` de depuração esquecido.

## Antes de subir uma feature nova

Ao terminar uma tela ou API nova, vale repetir o mesmo tipo de checagem
feita nesta revisão: abrir o endpoint sem sessão e conferir que nega
acesso; mandar entrada malformada e conferir que não vaza stack trace;
olhar o console do navegador numa carga normal da tela em busca de erro
ou aviso; e conferir se algum novo host externo precisa entrar na CSP.
