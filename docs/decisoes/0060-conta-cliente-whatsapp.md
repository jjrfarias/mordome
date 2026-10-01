# ADR 0060: Conta do cliente com código pelo WhatsApp

Estado: implementação validada localmente; ativação do conector depende de infraestrutura e pareamento.
Data: 01/10/2026.

## Decisão

O cliente escolheu telefone com código e integração não oficial do WhatsApp. Usamos `whatsapp-web.js` 1.34.7 em serviço privado separado, com Chromium. A conexão persistente e o navegador justificam separar esse processo do Next.js; não adicionamos Redis, broker nem infraestrutura por cliente. A biblioteca não é afiliada ao WhatsApp e alerta sobre risco de bloqueio. Não há garantia de entrega de código por esse canal. Compra sem cadastro continua disponível; entrada só é oferecida quando o conector informa READY.

A conta é isolada por estabelecimento, com sessão própria em cookie HttpOnly/SameSite, token aleatório guardado apenas como hash no banco e validade de sete dias. Não é um User de operação, não recebe papéis da equipe e não herda acesso administrativo. O código tem seis dígitos criptograficamente aleatórios, validade de cinco minutos, cinco tentativas, uso único e HMAC vinculado à unidade e ao desafio. Pedidos de código: intervalo mínimo de um minuto, cinco por telefone/unidade/hora, vinte por IP/hora e cem por unidade/hora. Os limites de envio são persistidos e verificados em transação serializável. IP é armazenado como HMAC, não como texto no desafio.

O cliente autentica um telefone antes de obter sessão. Histórico e contagem usam `DeliveryOrder.customerAccountId` atribuído pelo servidor aos pedidos feitos com a sessão, nunca uma consulta dos pedidos antigos por telefone. A FK composta impede associar pedido ou sessão a conta de outra unidade. Alterações futuras para reconhecer pedidos anteriores exigem um fluxo próprio, inclusive para números reciclados ou compartilhados. Nome é uma informação declarada; não é comprovação de identidade civil.

O histórico mostra até os cinquenta pedidos mais recentes, com contagem total. A contagem de concluídos exige entrega, venda concluída e ausência de estorno. Não há pontos, saldo ou benefício sendo creditado nesta etapa. Login e logout geram eventos próprios persistidos, separados da auditoria de operadores. A gestão de WhatsApp usa a permissão existente `integrations.manage`, com auditoria das solicitações de conectar/desconectar.

## Conector

- API interna protegida por bearer token; não publicar domínio ou endpoint de mensagens anônimo. Somente `/health` não exige token.
- Endpoint de envio aceita apenas desafio pendente, telefone e código, sem texto livre. O próprio conector compõe a mensagem transacional. Não há campanhas, disparos em massa, leitura de conversas ou recepção de mensagens pela aplicação.
- Sessões WhatsApp separadas por unidade. Arquivo RemoteAuth cifrado com AES-256-GCM e unidade como AAD; chave fora do banco e do frontend. Perfil temporário do Chromium existe no disco efêmero durante a execução, em diretório privado; o estado de navegador pode conter metadados do WhatsApp Web. Não usar um número pessoal.
- Um lock de sessão PostgreSQL impede dois conectores de controlarem as mesmas conexões. O processo novo aceita health check e aguarda o antigo liberar o lock na troca de deploy.
- QR só sai pela API administrativa autenticada, com no-store. Nunca registrar QR, telefone, código, bearer token ou arquivos de sessão em logs.
- Desconexão limpa a credencial de acesso; não exclui pedidos ou contas. Desafios expirados há mais de um dia são removidos pelo conector; eventos de conta e histórico de pedidos são preservados. Revisar retenção de eventos no planejamento operacional do produto, sem exclusão automática nesta entrega.

## Dependências e fontes

`whatsapp-web.js`: Apache-2.0. `pg`: MIT. `qrcode`: MIT. Bibliotecas opcionais do RemoteAuth: `archiver` MIT, `unzipper` MIT, `fs-extra` MIT. `node-webpmux` é dependência transitiva LGPL-3.0-or-later, carregada dinamicamente e sem modificação: preservar COPYING.LESSER e distribuição do módulo ao distribuir a imagem. Não remover avisos de licença. O conector não usa recursos de mídia/stickers. Chromium é instalado como programa separado pelo gerenciador do sistema, com seus avisos de licença.

Puppeteer foi fixado por override em 25.12.0 para eliminar os alertas da cadeia antiga de extração de arquivos. `npm audit --omit=dev` do conector retornou zero vulnerabilidades; compatibilidade validada até a geração real de QR Code com Edge local. O pareamento, envio real e restauração após pareamento ainda precisam ser validados com o número autorizado.

- Biblioteca e limitações: https://wwebjs.dev/guide/
- Persistência e contrato RemoteAuth: https://wwebjs.dev/guide/creating-your-bot/authentication.html
- Licença principal: https://github.com/wwebjs/whatsapp-web.js/blob/main/LICENSE

Regras corporativas aplicadas: isolamento entre tenants, autoridade do backend, hash/criptografia e segredos fora do frontend, limite de abuso, minimização de dados, auditoria e revisão antes da publicação. A criação de serviço e configuração de variáveis no Railway segue `AI_RULES/05_AI_AGENT_RULES.md`, seção 2.
