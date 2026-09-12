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
- O seletor persistente fica no cabeçalho.
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
- Nunca executar `prisma migrate dev` contra produção. O ambiente bloqueou essa tentativa por risco de reset.
- Em produção, gerar SQL versionado e aplicar somente com `prisma migrate deploy`.
- O cadastro de produtos está bloqueado pelo ADR 0003. Não criar tela, API, seed ou ampliar o modelo de produtos sem conversar antes com o usuário.

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

## Próxima tarefa recomendada

Criar a área administrativa de **Estabelecimentos**, sem tocar em produtos.

Escopo da próxima fatia:

1. Adicionar navegação “Configurações” e tela “Estabelecimentos”.
2. Listar somente estabelecimentos da organização ativa.
3. Exibir nome, status, telefone e identificação/documento quando houver.
4. Criar novo estabelecimento com nome obrigatório e slug único dentro da organização.
5. Editar dados básicos de um estabelecimento.
6. Ativar/desativar sem exclusão física.
7. Impedir desativar a última unidade ativa.
8. Impedir que o usuário remova o próprio acesso à unidade ativa durante esta fatia.
9. Auditar criação, edição e mudança de status.
10. Aplicar autorização no servidor; nunca confiar em `organizationId` ou `establishmentId` enviados pelo navegador.

Antes de implementar, o próximo modelo deve decidir com o usuário se documento e telefone já entram nessa primeira tela e se todos os administradores poderão criar unidades. Se não houver resposta e o usuário disser apenas “vai”, implementar somente nome + status, preservando os demais campos do banco sem expô-los.

### Critérios de aceite

- Usuário só enxerga unidades da organização ativa.
- Tentativa cruzada retorna 403 ou 404 sem revelar dados.
- Nova unidade concede acesso ao criador dentro da mesma transação.
- Slug duplicado é tratado com mensagem compreensível.
- Última unidade ativa não pode ser desativada.
- Unidade desativada não pode ser selecionada para operação.
- Estados de carregamento, vazio, erro e sucesso existem na interface.
- Testes cobrem criação, isolamento entre organizações e bloqueio da última unidade.
- `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` passam.
- Documentação funcional, domínio e autorização são atualizados no mesmo commit.

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
- Não cadastrar produtos antes da conversa exigida no ADR 0003.
- Não publicar a branch Betão nem aplicar sua terceira migração em produção sem autorização.
- Não confundir protótipo local com persistência operacional real.
- Não usar e-mail como login.
- Não remover tenancy, filtros de organização/unidade ou validação de acesso para simplificar código.
- Sempre liderar o retorno ao usuário pelo resultado e declarar limitações reais.

## Prompt curto para retomar

> Continue o Mordomê na branch `cliente/betao`. Leia `AGENTS.md` e `docs/HANDOFF-GPT-5.3.md` por inteiro. Confirme o Git limpo, preserve as decisões e implemente a próxima fatia descrita no handoff sem tocar no cadastro de produtos nem publicar na Railway.
