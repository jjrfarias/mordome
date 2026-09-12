# Handoff operacional para o próximo modelo

Leia este arquivo inteiro antes de alterar código. Depois leia `AGENTS.md` e os documentos diretamente ligados à tarefa. Este projeto usa Next.js 16; `AGENTS.md` obriga consultar a documentação instalada em `node_modules/next/dist/docs/` antes de programar APIs ou recursos do framework.

## Objetivo do produto

Mordomê é um SaaS de gestão para bares, lanchonetes e restaurantes. Deve atender PDV simples, salão, comandas, cozinha, caixa, estoque, relatórios e usuários com permissões personalizadas. Um cliente é uma `Organization` e pode possuir vários `Establishment`.

O primeiro cliente é o **Betão Hot Dog**. Toda personalização exclusiva dele deve permanecer na branch `cliente/betao` até o usuário decidir o que será incorporado à linha principal.

## Estado do Git

- Branch principal: `main` no commit `00ab8c0`.
- Branch ativa correta: `cliente/betao`.
- Último commit funcional antes deste handoff: `53a1c60`.
- O repositório remoto não está configurado de forma utilizável; não presumir que `git push` funcionará.
- Não reescrever histórico, não usar `git reset --hard` e não apagar alterações do usuário.
- Ao iniciar: executar `git status --short --branch` e confirmar que está em `cliente/betao`.

## O que já funciona

### Interface operacional

- Next.js App Router, React e TypeScript estrito.
- Layout responsivo com PDV rápido, salão, comanda, KDS e resumo.
- Estado operacional ainda é demonstrativo e usa `localStorage`.
- O estado local está particionado por `establishmentId`; nunca voltar a usar uma chave global única.

### Identidade Betão

- Tema vermelho, dourado e creme isolado na branch do cliente.
- Entrada redesenhada com logo em destaque e sem lista fixa de unidades.
- Logo completa: `public/clientes/betao/logo-recriada-v1.png`.
- Símbolo compacto: `public/clientes/betao/simbolo-compacto-v1.png`.
- Os arquivos são recriações provisórias e precisam de aprovação; não alegar que são originais oficiais.
- Briefing: `docs/clientes/BETAO.md`.

### Autenticação

- Login cotidiano usa **usuário e senha**, nunca e-mail.
- Senhas reais usam `scrypt` com salt aleatório em `lib/password.ts`.
- Sessão real usa token aleatório; somente o hash fica no PostgreSQL.
- Cookie: HTTP-only, SameSite Lax, Secure em produção.
- APIs em `app/api/auth/`.
- Existe modo de teste local em `lib/local-auth.ts`; ele só liga quando `NODE_ENV !== "production"` e `LOCAL_AUTH_ENABLED=true`.
- As credenciais de teste ficam somente em `.env.local`, que é ignorado pelo Git. O próximo modelo pode ler esse arquivo local quando precisar testar, mas não deve commitá-lo nem copiar a senha para documentação ou mensagens sem solicitação explícita.

### Multiestabelecimento

- A sessão possui `activeEstablishmentId`.
- O seletor persistente fica em um card na base do menu lateral, no lugar do antigo card de turno. O cabeçalho exibe apenas a data, o título da página e as ações operacionais.
- `POST /api/auth/establishment` valida se o estabelecimento está em `EstablishmentAccess`.
- Acesso inexistente/não autorizado deve continuar retornando HTTP 403.
- O modo local oferece quatro unidades de teste em `lib/local-auth.ts`. Elas são opções dinâmicas internas, não texto institucional da tela de entrada.
- A lista de unidades foi removida da entrada porque o Betão pode abrir novas lojas. Não reintroduzir quantidade ou nomes fixos no login.

## Banco e migrações

- Prisma 7.10 com PostgreSQL e `@prisma/adapter-pg`.
- Schema: `prisma/schema.prisma`.
- Migrações:
  - `20260912024755_init`: base multiempresa, autorização, caixa, venda e auditoria.
  - `20260912123000_username_sessions`: troca e-mail por username e cria sessões.
  - `20260912170000_active_establishment_session`: persiste a unidade ativa; existe na branch, mas ainda não foi aplicada à Railway.
  - `20260912193000_owner_establishment_permission`: cria `establishments.manage`, o perfil de sistema Proprietário e vincula o membro ativo mais antigo das organizações existentes.
  - `20260912203000_catalog_inventory_recipe_foundation`: cria catálogo organizacional, ofertas por canal/unidade, estoque, conversões, movimentos, receitas e permissões administrativas. Está versionada, mas não foi aplicada à Railway.
  - `20260912223000_operational_sales_inventory`: adiciona idempotência e snapshot às vendas, permite vínculo posterior ao caixa e cria permissões operacionais. Não foi aplicada à Railway.
  - `20260912233000_cash_operations`: adiciona movimentos de caixa, conferência do fechamento, unicidade de caixa aberto por operador/unidade e permissões de caixa. Não foi aplicada à Railway.
  - `20260912234500_complete_audit_history`: amplia ações e índices de auditoria, registra agente do navegador e cria `audit.view`. Não foi aplicada à Railway.
  - `20260913001000_persistent_floor_orders`: cria mesas, comandas, itens, rodadas, histórico da cozinha e vínculo transacional com vendas. Não foi aplicada à Railway.
  - `20260913013000_user_role_permissions`: adiciona permissões independentes de equipe, perfis e resumo financeiro ao perfil Proprietário. Não foi aplicada à Railway.
  - `20260913023000_cancellations`: registra cancelamentos de itens por rodada e cria `tabs.cancel_item` e `pos.cancel_sale`. Não foi aplicada à Railway.
- Nunca executar `prisma migrate dev` contra produção. O ambiente bloqueou essa tentativa por risco de reset.
- Em produção, gerar SQL versionado e aplicar somente com `prisma migrate deploy`.
- O cadastro de produtos foi autorizado após a conversa funcional e está implementado conforme o ADR 0006. Alterações grandes na regra de catálogo ainda devem ser alinhadas antes.

## Railway

- Projeto: `Mordomê`.
- Project ID: `6aa3a4f6-1005-41df-8357-6adb13d56657`.
- Ambiente: `production`, ID `9a1af929-8bb0-463a-92eb-4be8d2fce989`.
- Serviço web: `web`, ID `5f487596-bcd0-473c-a9d5-c1a71b70d366`.
- PostgreSQL: serviço `Postgres`, ID `12ad7a56-da41-4621-b856-5d27b716ab22`.
- URL pública atual: <https://web-production-69fa8.up.railway.app>.
- A branch Betão **não está publicada**. Não sobrescrever a produção principal sem autorização explícita do usuário.
- O banco não tem acesso TCP público. Para manutenção, usar `railway connect Postgres --tunnel-only` e fechar o túnel ao terminar.
- `DATABASE_URL` do serviço web referencia `${{Postgres.DATABASE_URL}}`; nunca copiar senha para o repositório.
- Backups automáticos/PITR ainda não estão habilitados.
- `railway.json` funciona, mas a Railway anunciou descontinuação em 01/12/2026. A migração para `.railway/railway.ts` falhou no Windows por detecção incorreta da versão do CLI/SDK. Não apagar a configuração funcional até haver solução validada.

## Fluxo SaaS decidido, mas adiado

Não existe cadastro público definitivo. Após a compra da licença, o SaaS deverá provisionar a organização e enviar um link temporário ao e-mail da compra. Por esse link o proprietário define usuário e senha. O login normal continua sem e-mail. Leia o ADR 0004.

O endpoint atual de setup é transitório. Não divulgar a produção como onboarding final e não aprofundar cobrança, licenciamento ou envio de e-mail agora, salvo nova solicitação explícita.

## Continuidade local — proposta futura em amadurecimento

O usuário quer oferecer opcionalmente, por estabelecimento, um modo **Nuvem + Local**. Com conexão normal, a unidade confirma operações localmente e as envia imediatamente para a nuvem, permitindo ao administrador remoto vê-las em poucos segundos. Durante queda de internet ou da nuvem, a operação continua na rede interna, acumula eventos em fila durável e sincroniza automaticamente quando a conexão retornar.

O servidor local será a autoridade operacional da unidade híbrida; não criar failover automático de escrita para a nuvem quando ele cair, pois isso pode gerar split-brain. A instalação deve ser simples, idealmente um instalador Windows com código temporário de pareamento, configuração automática, atualização, backup e diagnóstico.

Esta arquitetura **não está fechada nem autorizada para implementação**. Antes, amadurecer requisitos e comparar tecnologias por provas de conceito. Leia o ADR 0008, que registra alternativas de execução, banco local, outbox/inbox, eventos, rede, segurança, atualização, observabilidade e questões abertas.

## Caixa implementado nesta etapa

O caixa real por unidade e operador está implementado. O PDV e o salão usam o catálogo do canal/unidade e finalizam vendas transacionais com snapshot, pagamento, consumo idempotente, vínculo ao caixa aberto e suporte de estorno na API.

A separação por unidade está explícita: produtos/categorias são a definição compartilhada da organização, enquanto ofertas do cardápio, fichas técnicas, política e saldo de estoque pertencem à unidade ativa. A transferência de estoque entre unidades autorizadas já está implementada com movimentos `TRANSFER_OUT`/`TRANSFER_IN`, idempotência, auditoria e bloqueio de saldo insuficiente.

Escopo entregue:

1. Criar abertura de caixa por unidade, operador e valor inicial.
2. Exigir caixa aberto para novas vendas.
3. Registrar suprimento, sangria e justificativa auditável.
4. Vincular as vendas novas ao `CashSession` ativo.
5. Fechar o caixa com valores esperados e informados por forma de pagamento.
6. Exibir divergência sem alterar vendas históricas.
7. Adicionar permissões independentes `cash.open`, `cash.move`, `cash.close` e `cash.history.view`.

### Critérios de aceite

- Apenas um caixa aberto por operador/unidade conforme a política definida.
- Venda nova recebe o `cashSessionId` do caixa aberto na mesma unidade.
- Sangria e suprimento preservam ator, valor, data e justificativa.
- Fechamento calcula o esperado por forma de pagamento e registra a divergência informada.
- Nenhum caixa, movimento ou venda atravessa organização ou estabelecimento.
- Estados de carregamento, vazio, erro e sucesso existem na interface.
- Testes de domínio local cobrem abertura duplicada, movimentos, fechamento, divergência, idempotência e isolamento. A exigência de caixa para venda é validada na rota operacional.
- `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` passam.
- Documentação funcional, domínio e autorização são atualizados no mesmo commit.

## Histórico implementado nesta etapa

Existe uma tela de histórico central, protegida por `audit.view`, com paginação, filtros, busca, responsável, unidade, data/hora, entidade, IP e snapshots protegidos de antes/depois. Login, logout, troca de unidade, vendas detalhadas, cancelamentos, caixa, estoque e cadastros persistentes alimentam a trilha. Leia o ADR 0007.

O salão, as comandas e a cozinha agora são persistidos no servidor. Cada inclusão ou alteração de item, envio de rodada, mudança de etapa e fechamento registra o ator. A consulta do histórico permite reconstruir todos os atendentes que atuaram em uma mesa.

## Salão persistente implementado nesta etapa

- `GET/POST /api/operations/floor` substitui o estado operacional de salão e cozinha no navegador.
- O primeiro item abre a comanda; novas quantidades podem formar rodadas posteriores.
- Itens já enviados não podem ser reduzidos sem o futuro fluxo de cancelamento justificado.
- A cozinha usa pedidos persistidos e transições sequenciais auditadas.
- O fechamento da conta recalcula a venda no servidor, preserva o preço da comanda, baixa estoque, vincula caixa/venda/comanda e libera a mesa.
- Unidades existentes recebem 12 mesas iniciais na migração; novas unidades recebem as mesas no cadastro.

## Usuários e perfis implementados nesta etapa

- A área `Configurações > Equipe e perfis` cria usuários com senha inicial, perfis personalizados e vínculos com múltiplas unidades.
- Um usuário pode acumular vários perfis e a interface exibe seu acesso efetivo.
- As permissões administrativas são `users.view`, `users.invite`, `users.disable`, `users.password.reset` e `roles.manage`; o resumo exige `finance.summary.view`.
- Redefinir senha encerra as sessões anteriores. O último proprietário ativo e o perfil de sistema são protegidos.
- O modo local permite validar a interface com dados em memória; reiniciar o servidor apaga os usuários e perfis de demonstração.
- Exceções individuais são configuradas na própria ficha do usuário como herdar, liberar ou bloquear. Exigem justificativa, mostram sua origem e entram imediatamente no cálculo; bloqueios prevalecem.

## Próxima tarefa recomendada

Implementar descontos autorizados e pagamento dividido. Depois, criar reembolso para vendas cujo caixa original já foi fechado.

## Arquivos principais

- `app/page.tsx`: interface monolítica atual; evitar fazê-la crescer indefinidamente. Extrair a próxima tela para componente próprio.
- `app/globals.css`: estilos globais e tema Betão.
- `components/ui.tsx`: componentes compartilhados e co-branding.
- `lib/auth.ts`: sessão real e estabelecimento ativo.
- `lib/local-auth.ts`: sessão exclusivamente local.
- `lib/authorization.ts`: cálculo de permissão efetiva.
- `lib/domain.ts`: domínio demonstrativo do PDV/salão.
- `prisma/schema.prisma`: fonte de verdade do banco.
- `docs/`: fonte de verdade funcional e arquitetural.

## Validação e execução local

Requer Node.js 20 ou superior. O servidor local normalmente já usa a porta 3000.

```powershell
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

O build precisa de `DATABASE_URL` mesmo sem conectar ao banco, pois o Prisma carrega a configuração durante `generate`. `.env.local` já fornece uma URL local fictícia e liga o acesso de demonstração. Docker Desktop está instalado, mas o engine não funciona enquanto o WSL não estiver configurado; não gastar tempo tentando usar Docker sem resolver essa dependência.

## Regras de continuidade

- Responder e documentar em português do Brasil.
- Preservar a marca Mordomê como produto e Betão como cliente: “Mordomê para Betão”.
- Não colocar lista ou quantidade fixa de lojas em comunicação institucional.
- O cadastro de produtos está autorizado e deve preservar as decisões do ADR 0006.
- Não publicar a branch Betão nem aplicar suas migrações pendentes em produção sem autorização.
- Não confundir protótipo local com persistência operacional real.
- Não usar e-mail como login.
- Não remover tenancy, filtros de organização/unidade ou validação de acesso para simplificar código.
- Sempre liderar o retorno ao usuário pelo resultado e declarar limitações reais.

## Atualização — fechamento operacional (12/09/2026)

Foram concluídos desconto autorizado, pagamento dividido com troco em dinheiro, reembolso após fechamento do caixa e ajustes de estoque por perda/consumo interno/contagem física. A fonte da decisão é `docs/decisoes/0011-fechamento-financeiro-e-ajustes.md`; a migration pendente é `20260913052000_financial_completion`. Não aplicar na Railway sem autorização. Validação local concluída com schema Prisma, TypeScript, ESLint, 40 testes e build de produção.

## Prompt curto para retomar

> Continue o Mordomê na branch `cliente/betao`. Leia `AGENTS.md`, `docs/HANDOFF-GPT-5.3.md` e os ADRs por inteiro. Preserve as decisões e implemente usuários e perfis personalizados com acesso por unidade e auditoria, sem publicar na Railway.

## Atualização — impressão operacional (12/09/2026)

A impressão pelo navegador foi integrada ao comprovante não fiscal do PDV/salão e às comandas separadas por estação de preparo. A configuração de comprovante pertence à unidade; a de cozinha pertence a cada estação. Reimpressões de vendas e pedidos passam pela permissão `print.reprint` e registram `PRINT_REPRINT` antes de abrir o diálogo. Leia o ADR 0013. A migration pendente é `20260913060000_audited_reprints`; não aplicá-la na Railway sem autorização. O navegador registra a solicitação, mas não consegue confirmar a saída física do papel; impressão silenciosa e fila resiliente dependem do futuro agente local ESC/POS.

Validação local concluída com schema Prisma, TypeScript, ESLint, 41 testes, build de produção e smoke tests das APIs de PDV, salão, cozinha, caixa, reembolso, reimpressão e auditoria. O `npm audit` ainda aponta quatro ocorrências altas transitivas no CLI Prisma 7.10 (`deepmerge-ts` e `mysql2`). O projeto usa PostgreSQL e essas dependências pertencem ao ferramental de build; a versão estável atual do Prisma ainda as fixa e o reparo automático propõe downgrade incompatível. Não usar `npm audit fix --force`; reavaliar na próxima versão estável do Prisma.
