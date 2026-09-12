# ADR 0007 — Histórico e auditoria completa

## Status

Aceito em 12/09/2026.

## Contexto

O operador precisa descobrir quem entrou no sistema, abriu ou movimentou o caixa, realizou ou cancelou uma venda, alterou cadastros, movimentou estoque e atuou em cada mesa. Um simples histórico de vendas não atende a rastreabilidade operacional, financeira e de segurança.

## Decisão

- `AuditEvent` é a linha do tempo central e somente recebe novos registros; eventos antigos não são editados pela aplicação.
- Cada evento contém organização, unidade quando aplicável, ator, ação, tipo e ID da entidade, data/hora, motivo, IP, agente do navegador e snapshots `before`/`after` quando houver alteração.
- Senhas, hashes, tokens, cookies, segredos e cabeçalhos de autorização são ocultados antes da exibição.
- A consulta exige `audit.view` e limita os eventos às unidades que o usuário pode acessar. Eventos organizacionais, como login, também podem ser vistos por quem possui essa permissão.
- Venda finalizada registra canal, mesa quando houver, forma de pagamento, caixa, produtos, quantidades, preços e totais.
- Caixa registra abertura, suprimento, sangria, fechamento, conferência e divergência.
- Alterações cadastrais preservam estado anterior e posterior sempre que possível.
- No salão persistente, cada abertura/alteração de comanda, item, envio e mudança de etapa terá seu próprio ator. Assim, uma mesa pode ter vários atendentes identificados ao longo do atendimento, sem depender de um único campo “atendente atual”.
- A trilha produzida pelo modo local é demonstrativa e reinicia com o servidor. Auditoria oficial existe somente em banco persistente.

## Consequências

- O histórico pode ser filtrado por unidade, ação e texto, com detalhes do evento.
- Operações sensíveis devem gravar a alteração e o evento na mesma transação.
- Novas operações persistentes não são consideradas concluídas sem seu evento de auditoria e teste de isolamento.
- Mesas, comandas, rodadas de pedido e cozinha estão persistidas; cada ação relevante alimenta a auditoria com seu ator.
- Retenção, exportação, assinatura criptográfica e política para tentativas de login com usuário inexistente serão definidas antes da produção em escala.
