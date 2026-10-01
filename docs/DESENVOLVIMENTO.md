# Método de desenvolvimento

## Estratégia

Trabalhar em fatias verticais pequenas e executáveis. Cada fatia atravessa interface, autorização, caso de uso, domínio, persistência, auditoria e testes necessários. Evitar construir várias telas desconectadas.

## Ordem da fundação

1. Esquema PostgreSQL/Prisma para organização, unidade, usuário e associação.
2. Autenticação e sessão.
3. Autorização granular e seletor de unidade.
4. Migração do catálogo e PDV para o servidor.
5. Salão/comandas/pedidos e KDS em tempo real.
6. Caixa, auditoria, estoque e relatórios.

## Fluxo de uma funcionalidade

1. Atualizar requisito e regra em `docs/`.
2. Registrar ADR quando houver decisão estrutural ou alternativa relevante.
3. Definir permissão e escopo.
4. Escrever caso de uso e validações.
5. Implementar persistência e interface.
6. Cobrir regra crítica, autorização e tenant com testes.
7. Executar lint, tipos, testes e build.
8. Revisar visualmente estados e breakpoints afetados.

## Padrões

- TypeScript estrito; evitar `any`.
- Regras de negócio fora dos componentes React.
- Inputs externos validados no servidor.
- Funções e casos de uso nomeados pelo comportamento do negócio.
- Datas em UTC na persistência e localizadas na apresentação.
- Valores monetários determinísticos.
- Componentes reutilizáveis seguem `IDENTIDADE-VISUAL.md`.
- Alterações de banco sempre por migração versionada.

## Testes mínimos

- Unidade para invariantes e cálculos.
- Integração para transações e autorização.
- Teste explícito de acesso cruzado entre organizações e estabelecimentos.
- Fluxo ponta a ponta para login, seleção de unidade, PDV e salão.
- Regressão para cancelamento, desconto, caixa e permissões.

## Definição de pronto

- Critério funcional atendido e documentado.
- Permissões e auditoria definidas.
- Estados vazio, carregando, erro, sucesso e confirmação tratados.
- Responsividade e acessibilidade verificadas.
- `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` aprovados.
- Limitações conhecidas registradas.

## Commits e revisão

Fluxo Git (ADR 0059): `main` é a única branch permanente, no GitHub e no clone local único. Antes de começar, `git pull --ff-only`. Mudança que precisa de revisão usa uma branch curta e um pull request para a `main`, e a branch é apagada depois do merge. Não manter trabalho só na máquina local nem worktrees permanentes. Como ainda não há CI, o PR registra o resultado local de lint, typecheck, testes e build.

Preferir commits pequenos por intenção. Pull requests devem explicar problema, solução, impactos de tenant/permissão, migração, evidências de teste e alterações visuais.
