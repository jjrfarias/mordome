# ADR 0055: Sincronização funcional da main com identidade padrão

## Contexto

A evolução funcional do Mordomê ocorreu inicialmente na branch `cliente/betao`, que também recebeu uma apresentação visual específica do primeiro cliente. A linha principal precisava receber os mesmos módulos e correções sem transformar essa personalização na identidade padrão do SaaS.

## Decisão

1. A branch `main` acompanha a base funcional da `cliente/betao`, incluindo APIs, domínio, migrations, módulos operacionais, relatórios, testes e correções de segurança disponíveis até o commit `91e6c87`.
2. A apresentação padrão da `main` continua seguindo `docs/IDENTIDADE-VISUAL.md`: verde garrafa, areia, terracota, monograma editorial do Mordomê e mensagens institucionais genéricas.
3. Logo, banner, nome e destaque das vitrines públicas continuam sendo configurações do estabelecimento. Quando não houver logo configurado, a interface usa a assinatura padrão do Mordomê.
4. O adaptador local usa nomes genéricos de organização, unidades e administrador. Identificadores históricos das unidades locais foram preservados para manter compatibilidade com testes e dados do protótipo.
5. Ativos e documentação específicos de clientes podem continuar versionados para rastreabilidade, mas não podem ser aplicados globalmente na `main`.

## Validação

- 259 testes automatizados aprovados.
- TypeScript, schema Prisma e build de produção aprovados com Next.js 16.3.8.
- `npm audit` sem vulnerabilidades conhecidas.
- Lint sem erros, mantendo 24 avisos preexistentes.
- Login e cardápio público conferidos em execução com a identidade padrão do Mordomê.

## Regras relevantes

A decisão preserva consistência de produto sem misturar dados ou identidade entre clientes, conforme `AI_RULES/01_COMPANY_CONTEXT.md`, seções de consistência e isolamento, e mantém configurações de estabelecimento subordinadas ao tenant autorizado.
