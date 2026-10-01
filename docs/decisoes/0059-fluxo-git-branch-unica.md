# ADR 0059: Fluxo Git com branch única (`main`)

- Estado: aceito
- Data: 2026-10-01

## Contexto

O desenvolvimento usou, até aqui, uma branch por cliente (`cliente/betao`, ADRs 0004 e 0055), várias branches de funcionalidade e worktrees locais paralelas criadas por agentes diferentes. Parte do trabalho chegou a existir apenas no disco local, e o branch padrão do GitHub era `cliente/betao`. Desde o ADR 0057, a personalização de um cliente (logo e cores) é configuração do tenant, armazenada no banco, e não precisa mais de uma branch própria.

## Decisão

1. **`main` é a única branch permanente**, no GitHub (`jjrfarias/mordome`) e localmente, e é também o branch padrão do repositório. Em 01/10/2026, `cliente/betao` e as branches de funcionalidade já integradas foram removidas. Todo o conteúdo delas estava na `main`.
2. **Nada fica só na máquina local.** Há um único clone de trabalho (`C:\Projetos\Mordomê\mordome`), sem worktrees permanentes. Todo trabalho concluído vai para o GitHub.
3. **Mudança que precisa de revisão usa uma branch curta e um pull request para a `main`.** A branch é apagada logo após o merge. Correções e documentação seguem o mesmo caminho.
4. **Personalização de cliente é configuração, não branch.** Logo, cores, vitrine, banner e dados da unidade são cadastrados por tenant (ADRs 0053, 0057 e 0058). Ativos de cliente versionados em `public/clientes/` continuam no repositório só como referência histórica e não são aplicados globalmente.
5. **Publicação somente a partir da `main` atualizada**, conforme `AI_RULES/04_ARCHITECTURE_STANDARDS.md`, seção 4.

## Consequências

- A regra "customizações exclusivas permanecem em branches de cliente" (ADR 0004) e a sincronização `main` ↔ `cliente/betao` (ADR 0055) deixam de valer daqui em diante. Os dois ADRs continuam como registro histórico.
- O repositório ainda não tem CI: não existe `.github/workflows` na `main`. Até existir, lint, typecheck, testes e build rodam localmente e o resultado é registrado no pull request.
- Agentes (Codex, Claude) devem trabalhar no clone único, atualizar com `git pull` antes de começar e não criar worktrees permanentes.
