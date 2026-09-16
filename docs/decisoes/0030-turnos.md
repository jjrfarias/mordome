# ADR 0030: Turnos (escala de trabalho da equipe)

- Estado: aceito
- Data: 2026-09-16

## Contexto

O sistema já possui `CashSession` (`app/api/operations/cash/route.ts`, `components/operations/CashManagement.tsx`), que representa o **turno de caixa**: abertura/fechamento de caixa por operador, com apuração de valores, movimentações e conferência. Esta fatia introduz um conceito completamente diferente: **turno de trabalho da equipe** — a escala/horário em que cada funcionário trabalha (ex.: "Manhã", "Tarde", "Noite", "Fim de semana"), sem qualquer relação com dinheiro, vendas ou apuração de caixa. Os dois nunca devem se misturar: um garçom pode estar no "turno Manhã" (escala) sem nunca abrir um caixa, e um operador pode abrir e fechar vários caixas ao longo de um mesmo turno de trabalho.

Fora de escopo (explicitamente): controle de ponto/registro real de entrada-saída, cálculo de horas trabalhadas, vínculo com folha de pagamento, e qualquer bloqueio de operação fora do turno cadastrado. Esta fatia entrega apenas o cadastro de turnos e a atribuição de usuários a eles, como base para funcionalidades futuras (ex. relatório de horas, bloqueio de acesso fora do turno).

## Decisões

1. **Escopo por estabelecimento, não por organização.** Diferente de `CancellationReason` (ADR 0029, organização), turnos de trabalho são amarrados à escala de uma unidade física específica — os horários e a equipe de "Parque Aeroporto" não são os mesmos de "Anexo". Segue o mesmo padrão de `DeliveryArea` (ADR 0028): `WorkShift.establishmentId` com `@@unique([establishmentId, name])`.

2. **Horário como string `HH:mm`, dias da semana como string `"0,1,2,...,6"`.** Optou-se pela representação mais simples possível: `startTime`/`endTime` são strings de horário puro (sem data, sem timezone), e `daysOfWeek` é uma lista de inteiros 0–6 (0 = domingo, seguindo `Date.getDay()` do JavaScript) persistida como string separada por vírgula (ex. `"1,2,3,4,5"` para dias úteis). A API sempre recebe e devolve `daysOfWeek` como `number[]` no JSON — a serialização para string é um detalhe de persistência, não de contrato. Decidido nesta fatia por simplicidade; sujeito a revisão se o produto precisar de um tipo `DateTime`/array nativo do Postgres no futuro (ex. para comparar com o horário atual em regras automáticas).

3. **Atribuição por `OrganizationMembership`, não por `User`.** Um usuário pode ter memberships em mais de uma organização (e o mesmo `User.id` pode ter acessos diferentes por unidade via `EstablishmentAccess`). Seguindo o mesmo padrão já usado por `EstablishmentAccess` e `MembershipRole` em `UsersManagement.tsx`/`app/api/admin/users/route.ts`, a atribuição usa `WorkShiftAssignment.membershipId` — mesma "unidade de identidade" usada para vincular um usuário a estabelecimentos e perfis. `@@unique([workShiftId, membershipId])` evita duplicidade.

4. **Atribuir o mesmo usuário duas vezes ao mesmo turno é idempotente, não um erro.** Ao contrário de outros cadastros (onde duplicidade de nome é rejeitada com 409), atribuir um usuário já atribuído simplesmente não faz nada e retorna sucesso — é uma ação de toggle/checkbox na UI, e tratar como erro atrapalharia cliques duplos ou race conditions na tela sem trazer benefício. Decidido nesta fatia, sujeito a revisão.

5. **Sem exclusão, apenas inativação (`active: false`).** Mesmo padrão de todos os cadastros do sistema (ADR 0017, decisão 5; ADR 0028, decisão 3; ADR 0029, decisão 3). Um turno inativo permanece listado (com selo "Inativo") e mantém suas atribuições históricas, mas deveria parar de aparecer como opção ativa em telas futuras de escala.

6. **Nenhuma lógica de negócio automática associada.** Esta fatia não valida se uma venda, abertura de caixa ou operação de PDV/salão ocorre dentro do turno cadastrado do usuário, nem calcula horas trabalhadas, nem gera relatórios de ponto. É puramente um cadastro de consulta/organização — a base para essas funcionalidades futuras, mas sem qualquer enforcement agora.

7. **Permissão: reaproveita `establishments.manage`.** Mesma decisão da ADR 0029 (Motivos de cancelamento): cadastrar turnos é uma configuração administrativa da unidade, não uma ação financeira (`finance.manage`) nem de estoque/cardápio (`catalog.manage`). Diferente dos Motivos de cancelamento, aqui não há necessidade de uma permissão de leitura mais ampla (`GET` liberado a qualquer sessão) — turnos não bloqueiam nenhum fluxo operacional em uso, então tanto leitura quanto escrita exigem `establishments.manage`. A tela de atribuição de usuários também consulta `GET /api/admin/users` (mesma rota de Equipe e perfis) para listar quem pode ser atribuído; isso exige adicionalmente `users.view` (`canViewUsers`) — se o operador tiver `establishments.manage` mas não `users.view`, a aba Turnos funciona normalmente (criar/inativar turno), mas a seção de atribuição de equipe fica oculta. Decisão sujeita a revisão se o produto quiser uma permissão dedicada (ex. `work-shifts.manage`) no futuro.

8. **Rota única `app/api/admin/work-shifts/route.ts` com discriminated union.** `GET` lista os turnos do estabelecimento ativo (com `assignedMembershipIds`). `POST` aceita `action: "CREATE" | "ASSIGN_USER" | "UNASSIGN_USER"` — mesmo padrão de `app/api/operations/cash/route.ts`. `PATCH` atualiza campos do turno (`name`, `startTime`, `endTime`, `daysOfWeek`, `active`).

9. **UI como nova sub-aba "Turnos" em `SettingsWorkspace.tsx`**, ao lado de "Motivos de cancelamento" (`components/admin/WorkShiftsManagement.tsx`). Formulário de criação com nome, horário de início/fim (`<input type="time">`) e seletor de dias da semana em chips clicáveis (reaproveitando a classe `.chips` já usada nos filtros de categoria do PDV/salão). Cada turno listado tem um botão "Equipe" que expande a lista de usuários da unidade com checkboxes para atribuir/desatribuir.

10. **Migração manual.** Como nas fatias anteriores, o ambiente de banco não estava acessível durante esta implementação; a migração `20260923090000_turnos` foi escrita manualmente seguindo o padrão de `20260922090000_motivos_de_cancelamento` e deve ser aplicada com `npx prisma migrate deploy` antes de liberar a tela em produção. Ela cria as tabelas `WorkShift` e `WorkShiftAssignment`.

11. **Modo local segue o adaptador em memória.** `lib/local-work-shifts.ts` foi criado no mesmo estilo de `lib/local-delivery-areas.ts` (CRUD com checagem de duplicidade por nome via `sameName`, mais as funções `assignLocalWorkShiftUser`/`unassignLocalWorkShiftUser` para a atribuição idempotente).

## Consequências

- A loja pode organizar sua escala de trabalho (quem trabalha em qual turno) diretamente no sistema, sem depender de planilha externa.
- Nenhum fluxo operacional existente é afetado: turnos de trabalho não bloqueiam nem alteram o comportamento de PDV, salão, delivery, caixa ou financeiro nesta fatia.
- A distinção entre "turno de trabalho" (escala) e "turno de caixa" (`CashSession`) fica documentada e isolada em módulos, rotas e componentes totalmente separados — não há acoplamento entre os dois.
- Funcionalidades futuras (relatório de horas trabalhadas, bloqueio de acesso fora do turno, alertas de escala) podem ser construídas sobre `WorkShift`/`WorkShiftAssignment` sem precisar remodelar o cadastro básico.
