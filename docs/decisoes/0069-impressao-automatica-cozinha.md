# Impressão automática da cozinha no Windows

Implementação de 07/11/2026. Um agente Windows consulta por HTTPS a cada três segundos
os pedidos da unidade vinculada. Imprime todas as linhas da cozinha em uma impressora,
independentemente de estação (instalação inicial: Liberdade, Goldensky, COM3 Bluetooth).
Salão, PDV e delivery usam os pedidos persistidos, sem depender do navegador remetente.

## Segurança e operação

- Aplicar a migração `20261107180000_kitchen_print_agent` antes de ativar.
- Provisionamento administrativo por `scripts/configure-kitchen-print-agent.mjs`, no
  ambiente confiável do servidor. Exige ID exato da unidade e hash SHA-256 de um token
  aleatório de 32 bytes. Recusa um segundo agente ativo na mesma unidade.
- O servidor guarda somente o hash. O PC guarda o token com DPAPI do usuário Windows
  em `token.xml`. Nunca colocar tokens no Git ou nos logs.
- O token permite somente consultar/reservar/confirmar comandas daquele agente e
  unidade. Não dá acesso a vendas, cadastros, contas nem ao painel administrativo.
- `active=false` em KitchenPrintAgent revoga imediatamente a credencial.
- Instalação local: `scripts/kitchen-print-agent.ps1`, `config.json` com `url` HTTPS
  e `port`, mais `token.xml`. Iniciar no logon do usuário Windows. PC deve permanecer
  ligado, conectado e com o usuário logado; fechar o navegador não interrompe o agente.
- O log `agent.log` tem rotação de 2 MB. `lastSeenAt` indica o último contato no servidor.

## Entrega e recuperação

Pedidos confirmados desde `activatedAt` geram KitchenPrintJob único por agente/pedido.
O agente recupera a fila após ficar offline. Pedidos antigos anteriores à ativação não
são impressos. A fila inclui pedidos já preparados durante uma interrupção; conferir
o horário impresso ao religar após uma parada prolongada.

A porta é aberta antes de reservar. Falha ao conectar mantém PENDING para tentar de
novo. A reserva atômica muda PENDING para SENDING; só um consumidor recebe os bytes.
Depois de enviar, grava recibo local e confirma SENT. Falha na confirmação só repete
o ACK, nunca a impressão. Interrupção durante o envio ou perda da resposta da reserva
mantém SENDING para conferência humana. Não há garantia de exatamente uma impressão
física: ESC/POS não confirma papel/corte; SENT significa bytes enviados ao dispositivo.

Cancelamento detectado antes da reserva bloqueia impressão antiga (REVIEW). Alterações
posteriores à reserva não podem desfazer papel já enviado. SENDING/REVIEW devem ser
conferidos pelo operador antes de qualquer reenvio; nesta primeira versão o diagnóstico
é pelo log/banco, sem tela de recuperação. Não voltar automaticamente a PENDING.

A função sanitiza controles ESC/POS de textos do catálogo e translitera acentos para
ASCII, evitando depender da tabela de caracteres do modelo. Papel de 80 mm, corte ao
final. Não altera impressão de recibos nem configuração de outras unidades. Caso haja
estações com impressão pelo navegador, desativá-la para evitar uma segunda via.

## Verificação

Teste físico COM3 confirmado pelo usuário: impressão e corte. Testes de formatação,
sanitização, token e snapshot em `tests/kitchen-print.test.ts`. Validação de tipos,
lint, testes e build antes da publicação. Primeiro pedido real após ativação ainda
exige confirmação física pelo operador.
