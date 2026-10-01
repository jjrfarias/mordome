# ADR 0060: Conta do cliente com código pelo WhatsApp

Estado: implementado localmente; pareamento do número e ativação em produção pendentes.

Data: 01/10/2026.

## Decisão

O cliente escolheu acesso por telefone com código pelo WhatsApp e decidiu usar Baileys, seguindo o formato já usado no Clínicas. A biblioteca conecta diretamente ao protocolo WhatsApp Web, sem Chromium, processo extra ou domínio público. Ela roda no processo Node.js do Mordomê e mantém uma conexão por unidade apenas quando essa unidade foi habilitada por um administrador autorizado.

A conta é isolada por estabelecimento, com sessão própria em cookie HttpOnly/SameSite, token aleatório guardado somente como hash e validade de sete dias. Não é um usuário operacional e não recebe papéis da equipe. O código tem seis dígitos aleatórios, validade de cinco minutos, cinco tentativas, uso único e HMAC vinculado à unidade e ao desafio. Há limite de um minuto entre pedidos, cinco por telefone/unidade/hora, vinte por IP/hora e cem por unidade/hora. O IP é armazenado somente como HMAC.

Histórico e contagem usam `DeliveryOrder.customerAccountId`, preenchido pelo servidor quando o pedido foi feito com sessão autenticada. Pedidos antigos nunca são associados apenas por telefone. A FK composta impede vincular uma conta de outra unidade. Login e logout geram eventos próprios; a gestão do WhatsApp exige a permissão existente `integrations.manage` e audita conectar/desconectar.

## Sessão e envio

- A sessão Baileys é persistida no campo de conexão da própria unidade, cifrada com AES-256-GCM. A chave é derivada de `CUSTOMER_AUTH_SECRET`, que permanece apenas nas variáveis do ambiente. Cada unidade é AAD da cifra, portanto um arquivo não pode ser usado em outra unidade.
- QR Code só é retornado na rota administrativa autenticada, com `no-store`. Não são registrados QR, telefone, código, token ou credenciais em logs.
- O envio público só alcança o Baileys após existir desafio pendente, com limites e validação no backend. A mensagem é fixa, transacional e sem conteúdo livre. Não há leitura de conversas, webhooks, campanhas ou respostas automáticas.
- Desconectar remove a credencial do WhatsApp, sem apagar contas ou pedidos. Se a sessão for encerrada pelo WhatsApp, a credencial também é descartada e será preciso novo QR.
- Comprar sem cadastro continua disponível. A entrada aparece somente quando a sessão da unidade estiver `READY`.

## Riscos e licença

Baileys não é API oficial da Meta e pode sofrer bloqueio, desconexão ou mudança de protocolo. Não há garantia de entrega. O número conectado deve ser de atendimento da unidade, nunca pessoal.

Baileys é MIT, mas traz `libsignal` GPL-3.0 transitivamente. A decisão humana de 01/10/2026 foi usar Baileys no Mordomê após comparação com o Clínicas; ela é registrada aqui como aceite específico deste produto. A dependência está travada em `7.0.0-rc14`; qualquer atualização, expansão para mensagens de marketing, leitura de conversas ou mudança de arquitetura exige nova revisão jurídica/técnica. `qrcode`, `pino` e `jimp` são MIT. O `npm audit --omit=dev` foi executado na inclusão.

## Ativação

1. Definir `CUSTOMER_AUTH_SECRET` aleatório de ao menos 32 caracteres nas variáveis de produção.
2. Como administrador da unidade, abrir Configurações → Integrações → WhatsApp e escolher Conectar WhatsApp.
3. Ler o QR no aparelho de atendimento e aguardar o status Conectado.
4. Com autorização do dono de um telefone de teste, solicitar um código, entrar, sair e reiniciar o web para confirmar a restauração da sessão. Não criar pedidos fictícios na produção.
5. Testar que outra unidade não enxerga QR, sessão ou histórico dessa unidade.

Regras corporativas aplicadas: isolamento por tenant, autorização no backend, criptografia em repouso, segredos fora do frontend, limitação de abuso, minimização e auditoria. A variável de produção ainda requer a confirmação de infraestrutura prevista em `AI_RULES/05_AI_AGENT_RULES.md`, seção 2.
