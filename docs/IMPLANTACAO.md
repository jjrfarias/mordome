# Implantação

## Produção atual

- Plataforma: Railway, projeto `Mordomê`, ambiente `production`.
- Aplicação: serviço `web`, publicado em <https://web-production-69fa8.up.railway.app>.
- Banco: PostgreSQL 18 no serviço `Postgres`, com volume persistente.
- Comunicação aplicação-banco: rede privada da Railway por referência `${{Postgres.DATABASE_URL}}`.
- Acesso público direto ao PostgreSQL: desativado.
- Schema: Prisma; migrações versionadas em `prisma/migrations`.
- Health check: `GET /api/health`.

## Processo de deploy

O Railpack executa `npm run build`. Antes de iniciar uma nova versão, a Railway executa `npm run db:deploy`; se a migração falhar, o deploy não prossegue. A aplicação inicia com `npm start` e só é considerada saudável quando `/api/health` responde com HTTP 2xx.

A configuração está em `railway.json`. Em 12/09/2026, a migração oficial para `.railway/railway.ts` foi testada, mas o SDK `railway@3.11.0` identificou incorretamente a Railway CLI 5.54.0 no Windows como antiga. O formato atual funciona, porém a Railway anunciou sua descontinuação para 01/12/2026. Migrar para Infrastructure as Code antes dessa data.

## Estado e limitações

### Exceção de publicação autorizada em 30/09/2026

O responsável autorizou explicitamente nesta sessão o deploy manual dos ajustes do commit `2965bf9`, pela branch `cliente/betao`, incluindo a migração pendente `20260917130000_harden_order_idempotency`. A autorização é pontual: não altera a regra corporativa de publicação pela `main`, com revisão e CI (`AI_RULES/04_ARCHITECTURE_STANDARDS.md`, seção 4).

O pacote passou por 259 testes, TypeScript, build e validação do schema Prisma. Foram informadas e aceitas as limitações: a migração e a concorrência não foram validadas em PostgreSQL real nesta revisão. A publicação deve manter o pre-deploy de migrations e o health check existentes; esta autorização não permite desativar autenticação, isolamento ou proteções de dados.

- Deploy e health check validados em 12/09/2026.
- O banco contém a migração inicial, mas a interface ainda usa o adaptador demonstrativo em `localStorage`; publicar não transforma o protótipo em operação multiusuário.
- Backups automáticos e recuperação point-in-time ainda não estão habilitados.
- Credenciais não devem ser adicionadas ao repositório. Para manutenção local, usar túnel privado da Railway CLI.
