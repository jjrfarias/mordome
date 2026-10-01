# Conector privado do WhatsApp

Leia o ADR 0060. Esta conexão é não oficial e pode cair ou ser bloqueada. O site não depende dela para comprar sem cadastro.

## Publicação proposta

1. Publicar a aplicação com as migrations aditivas de contas/eventos. Sem as variáveis de autenticação, não aparece botão de entrada para clientes.
2. Após autorização da infraestrutura, criar **mordome-whatsapp** no mesmo projeto/environment Railway do web. Usar o repositório/root atual, Dockerfile `services/whatsapp/Dockerfile`, uma réplica e health check `/health`. Não aplicar os comandos Next.js de build/start/predeploy de `railway.json` a este serviço; usar configuração própria do serviço. Sem domínio público e sem volume persistente.
3. Configurar no conector `DATABASE_URL` do mesmo PostgreSQL, `PORT=8090`, `WHATSAPP_GATEWAY_TOKEN` aleatório com pelo menos 32 caracteres e `WHATSAPP_ENCRYPTION_KEY` com 32 bytes aleatórios codificados em base64. Não imprimir ou versionar as chaves. Guardar cópia protegida da chave de criptografia: perdê-la exige novo pareamento.
4. No web, configurar `WHATSAPP_GATEWAY_URL=http://mordome-whatsapp.railway.internal:8090`, o mesmo `WHATSAPP_GATEWAY_TOKEN` e um `CUSTOMER_AUTH_SECRET` aleatório independente. Ajustar o hostname ao nome privado efetivo do Railway. Reiniciar/publicar o web para aplicar as variáveis.
5. Entrar como administrador autorizado da unidade em Configurações → Integrações → WhatsApp. Usar **Conectar WhatsApp**, ler o QR no aparelho da unidade e aguardar Conectado. RemoteAuth demora aproximadamente um minuto para o primeiro backup após pareamento; não reiniciar imediatamente após ler o QR.
6. Com autorização do dono do telefone de teste, solicitar um único código pela vitrine, verificar entrada e logout. Reiniciar o conector e confirmar restauração. Confirmar que outra unidade não mostra o mesmo QR nem histórico. Não criar pedidos fictícios de produção.
7. Se a sessão cair, abrir as integrações e reconectar; se o número for bloqueado, desabilitar a integração e manter compra sem cadastro até definir outro canal. SMS não está implementado.

O limite inicial é cinco conexões por processo (`WHATSAPP_MAX_CONNECTIONS`), para evitar abrir navegadores sem controle. Medir memória/CPU por conexão antes de aumentar. O serviço adicional pode aumentar o custo da hospedagem; não há estimativa de custo validada nesta entrega.

## Validação local

- `npm ci --prefix services/whatsapp` (definir `PUPPETEER_SKIP_DOWNLOAD=true` se usar Chrome/Edge instalado).
- `npm test --prefix services/whatsapp` e `npm audit --prefix services/whatsapp --omit=dev`.
- Banco isolado migrado; `node services/whatsapp/server.mjs` com as variáveis acima e `CHROME_PATH` do navegador instalado.
- `scripts/check-customer-account-postgres.ts` usa gateway HTTP simulado local na porta 3113 e **não envia mensagens reais**. Aplicação de teste deve apontar para `http://127.0.0.1:3113`, token sintético `local-test-gateway-token-0123456789`, `CUSTOMER_AUTH_SECRET` sintético com 32+ caracteres e `LOCAL_AUTH_ENABLED=false`. Executar com `TEST_DATABASE_URL` e `TEST_APP_URL` locais.
- A validação real de QR foi realizada sem parear aparelho ou enviar mensagens. Docker/Linux e sessão persistida após pareamento precisam da validação operacional do serviço.
