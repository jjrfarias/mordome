# Mordomê — Tudo sob controle.

> A documentação completa e versionada começa em [`docs/README.md`](docs/README.md). Ela é a fonte de verdade para produto, funções, arquitetura, domínio, autorização, método de desenvolvimento e decisões.

## Segurança de contas — atualização de 06/11/2026

Recuperação de senha por e-mail confirmado e cadastro/confirmação/troca de e-mail estão
implementados. No login, use **Esqueci minha senha**; dentro do sistema, **Segurança da conta**.
O envio exige configurar o SMTP contratado e as variáveis descritas em `.env.example`.
Contas existentes continuam usando usuário e senha; precisam cadastrar e confirmar seu
e-mail antes de usar a recuperação. Veja [ADR 0062](docs/decisoes/0062-recuperacao-senha-confirmacao-email.md)
para implantação, testes, segurança e limites. As seções de protótipo abaixo são históricas
e não representam o estado completo dos módulos operacionais atuais.

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
2. Evolução da segurança de contas (MFA, convites e política de confirmação obrigatória), gestão de usuários e aplicação completa do RBAC no servidor.
3. APIs validadas no servidor e escopo obrigatório por estabelecimento; testes de tentativa de acesso cruzado.
4. Eventos em tempo real no KDS e histórico completo de alterações.
5. Caixa por turno, pagamentos divididos, descontos/cancelamentos auditados.
6. Estoque básico, configurações, demais tipos de pedido e relatórios por período.
7. Service worker e ícones finais para instalação PWA/offline; observabilidade, backup e política LGPD.

## Limitações conhecidas

Registro histórico da primeira fatia: a autenticação e a sessão usavam PostgreSQL, mas os dados operacionais permaneciam locais. A implementação atual já possui módulos operacionais persistentes e recuperação de senha por e-mail confirmado; consulte os documentos de cada módulo para seus limites atuais. A proteção persistente contra abuso introduzida na ADR 0062 cobre os novos endpoints de segurança, não substitui ainda o limitador em memória do login existente.
