# Avaliação crítica — 17/09/2026

## Veredito

O Mordomê é um beta avançado com boa cobertura funcional e regras de domínio, mas ainda não deve ser tratado como SaaS de produção crítica sem concluir o endurecimento operacional abaixo.

Nota registrada na avaliação: **6,5/10**. Os 253 testes existentes passaram; o lint tinha 1 erro e 24 avisos; o build local dependia de `DATABASE_URL`.

## Plano priorizado

| Prioridade | Ponto | Estado |
| --- | --- | --- |
| P0 | Evitar estoque negativo em vendas concorrentes | Implementado; falta teste concorrente com PostgreSQL |
| P0 | Tornar limite de uso de cupom atômico | Implementado; falta teste concorrente com PostgreSQL |
| P0 | Isolar idempotência de venda por estabelecimento | Implementado; migração criada |
| P0 | Adicionar idempotência ao pedido público | Implementado; migração criada |
| P0 | Encerrar comandas técnicas de delivery | Implementado |
| P1 | Substituir rate limit em memória por armazenamento compartilhado | Pendente |
| P1 | Criar health check de prontidão com PostgreSQL | Implementado |
| P1 | Adicionar testes HTTP/PostgreSQL, concorrência e isolamento | Pendente |
| P1 | Remover `unsafe-inline` da CSP de produção | Pendente |
| P2 | Decompor rotas e componentes excessivamente grandes | Pendente |
| P2 | Atualizar README e documentação de produto | Pendente |
| P2 | Implantar CI com lint, tipos, testes, build e migrações | Pendente |

## Critério de liberação

Antes de um lançamento sem supervisão, todos os itens P0 devem estar concluídos e testados contra PostgreSQL real. Os itens P1 devem possuir responsável, prazo e mitigação operacional documentada.

## Observações técnicas

- O rate limit atual usa memória do processo e não é consistente entre réplicas ou reinícios.
- O health check original validava apenas o processo HTTP, sem confirmar acesso ao banco.
- A maioria dos testes cobre domínio/adaptadores locais; a camada HTTP e as transações Prisma precisam de cobertura própria.
- Alterações devem preservar o isolamento `organizationId`/`establishmentId` em consultas, chaves únicas e respostas idempotentes.

## Validação de delivery e pedido online

Validação funcional e visual realizada em produção, em telas móvel e desktop.

| Ponto | Estado |
| --- | --- |
| Pedido não pode sair para entrega sem entregador | Corrigido no servidor e na interface |
| Cancelamento acidental de pedido | Corrigido com confirmação explícita |
| Área obrigatória quando existem regiões configuradas | Corrigido no servidor e nas interfaces pública/interna |
| Unidade sem regiões configuradas | Corrigido: subtotal e taxa pendente são informados sem exibir um total enganoso |
| Pedido online vinculado ao histórico do cliente | Corrigido pelo telefone normalizado |
| Catálogo público da unidade Parque Aeroporto | Pendente de configuração comercial: apenas Água Mineral estava publicada |
| Áreas e taxas da unidade Parque Aeroporto | Pendente de configuração comercial: nenhuma área estava cadastrada |

Conclusão: o fluxo técnico está operacional e mais seguro, mas o pedido online não deve ser divulgado comercialmente até cadastrar produtos, áreas atendidas e taxas reais da unidade.

## Revisão local dos ajustes — 30/09/2026

Escopo: consolidar as alterações pendentes de catálogo, delivery e pedido online na branch `cliente/betao`. Esta revisão não equivale à conclusão de todo o plano P0–P2 acima.

- Consulta de CEP: limpa endereço, coordenadas e área anteriores quando o CEP muda e ignora respostas antigas que chegam fora de ordem.
- Coordenadas ausentes, vazias ou fora dos limites geográficos permanecem nulas, evitando posições falsas em zero.
- Pedido público: exige telefone normalizado com 8–15 dígitos e preserva o nome de clientes existentes. Informar um telefone não autoriza sobrescrever o cadastro; o nome informado continua no pedido.
- Venda: conflito de unicidade sem venda correspondente retorna HTTP 409, em vez de sucesso com `sale: null`.
- Logs novos de falhas em vendas, pedidos públicos e CEP registram eventos e códigos controlados, sem despejar exceções que podem conter dados de entrada.
- Descrições do catálogo receberam teste de publicação, preservação em alterações parciais e remoção explícita.

Validações: 259 testes aprovados; TypeScript e schema Prisma válidos. Lint geral sem erros, com 24 avisos. Navegação local pelo catálogo, sacola e formulário de pedido conferida no navegador; subtotal sem taxa definida identificado como tal. Teste HTTP com dados fictícios confirmou criação, repetição idempotente, isolamento da chave entre unidades e rejeição de telefone inválido no adaptador local.

Limites: não foram aplicadas migrations nem alterações em produção. Testes HTTP locais não comprovam concorrência ou isolamento transacional no PostgreSQL. Permanecem pendentes os testes PostgreSQL, a configuração comercial e os demais itens do plano. A consulta externa de CEP não foi exercitada nesta revisão.

Regras relevantes: `03_SECURITY_STANDARDS.md`, seções 2 e 6 (isolamento e logs); `04_ARCHITECTURE_STANDARDS.md`, seções 7 e 8 (validação no servidor e testes); `05_AI_AGENT_RULES.md`, seção 4 (verificação de UI em execução).
