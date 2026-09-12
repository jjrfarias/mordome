# Mordomê — Tudo sob controle.

> A documentação completa e versionada começa em [`docs/README.md`](docs/README.md). Ela é a fonte de verdade para produto, funções, arquitetura, domínio, autorização, método de desenvolvimento e decisões.

Primeira fatia vertical funcional do SaaS para bares e restaurantes. Esta versão demonstra, de ponta a ponta: login, abertura de comanda pela mesa, inclusão de produtos, envio à cozinha, avanço do preparo, fechamento da conta e venda no resumo diário.

## Executar

Requer Node.js 20 ou superior.

```bash
npm install
npm run db:generate
npm run dev
```

Acesse `http://localhost:3000`.

Para usar a fundação PostgreSQL, copie `.env.example` para `.env`, execute `docker compose up -d` e `npm run db:migrate`.

No primeiro acesso a uma instalação vazia, a tela cria o proprietário, a organização, o primeiro estabelecimento, o usuário e a senha. Nos acessos seguintes, o login utiliza somente usuário e senha. Os dados operacionais do protótipo ainda persistem no `localStorage`.

## Validar

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Arquitetura e decisões

- Next.js com App Router, React e TypeScript estrito.
- Domínio independente da interface em `lib/domain.ts`, coberto por testes de regras essenciais.
- Interface responsiva em português do Brasil, valores e datas localizados, marca tipográfica provisória e navegação adequada a celular, tablet e desktop.
- Toda raiz agregada contém `establishmentId`. A chave local também contém o identificador do estabelecimento, antecipando o isolamento multiempresa.
- A primeira versão usa um adaptador local para ser testada imediatamente sem serviços externos. É um protótipo funcional, não uma implantação de produção.
- Serviço de 10% aplicado na interface. A venda registra o total de itens no domínio atual; a política contábil do serviço deve ser definida antes da migração definitiva.
- O sistema visual e suas regras de composição estão registrados em `docs/IDENTIDADE-VISUAL.md`; componentes compartilhados ficam em `components/ui.tsx`.

## Modelo de dados planejado

`Establishment` possui usuários, mesas, produtos, comandas, pedidos, caixas e estoque. `UserMembership` relaciona usuário, estabelecimento e perfil. `Tab` agrega itens e pagamentos; `KitchenOrder` mantém status e histórico. Entidades mutáveis e consultas sempre carregam `establishmentId`. Cancelamentos, descontos e fechamento de caixa geram `AuditEvent` com ator, instante, justificativa e representação da alteração.

## Próximas etapas

1. PostgreSQL + Prisma, migrações e seed idempotente.
2. Recuperação de acesso, gestão de usuários e aplicação completa do RBAC no servidor.
3. APIs validadas no servidor e escopo obrigatório por estabelecimento; testes de tentativa de acesso cruzado.
4. Eventos em tempo real no KDS e histórico completo de alterações.
5. Caixa por turno, pagamentos divididos, descontos/cancelamentos auditados.
6. Estoque básico, configurações, demais tipos de pedido e relatórios por período.
7. Service worker e ícones finais para instalação PWA/offline; observabilidade, backup e política LGPD.

## Limitações conhecidas

A autenticação e a sessão usam o PostgreSQL, mas os dados operacionais permanecem locais e podem ser alterados pelo usuário. Ainda não há recuperação de senha, rate limiting distribuído, RBAC aplicado a todos os endpoints, persistência operacional multiusuário, estoque, pedidos externos, sincronização em tempo real ou integração fiscal/TEF/gateway.
