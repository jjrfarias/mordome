# Arquitetura

## Objetivos

Aplicação web responsiva e instalável como PWA, em português do Brasil, com TypeScript, banco relacional e isolamento multiempresa desde a primeira versão de servidor.

## Arquitetura-alvo

- Next.js App Router para interface e camada HTTP.
- TypeScript estrito em cliente, servidor e domínio.
- PostgreSQL como fonte de verdade.
- Prisma para esquema, migrações e acesso ao banco.
- Sessão segura em cookie HTTP-only.
- Validação de entrada nas fronteiras cliente/servidor; servidor permanece autoritativo.
- Eventos em tempo real para KDS após persistência básica estar estável.

## Hierarquia de tenancy

```text
Platform
└── Organization (cliente/assinante)
    ├── Memberships (pessoas da organização)
    ├── CustomRoles (perfis reutilizáveis)
    └── Establishments (unidades)
        ├── Tables / Tabs / Orders
        ├── CashSessions / Sales / Payments
        └── Inventory / StockMovements
```

## Regra de isolamento

Entidades operacionais carregam `organizationId` e/ou `establishmentId` conforme seu escopo. O servidor obtém a organização e unidade ativas da sessão validada, verifica `EstablishmentAccess` e adiciona o filtro de tenant a toda consulta. IDs enviados pelo cliente nunca concedem acesso por si mesmos.

A sessão persiste `activeEstablishmentId`. A troca de unidade só é aceita quando o estabelecimento está entre os `EstablishmentAccess` ativos do usuário. No modo local, a mesma regra é simulada em cookie HTTP-only e o estado demonstrativo é particionado por unidade.

Consultas administrativas no nível da organização só agregam estabelecimentos incluídos no acesso efetivo do usuário. Testes devem tentar ler, alterar e relacionar IDs de outro tenant.

## Camadas

1. **Interface:** renderização, interação e validação de experiência.
2. **Aplicação:** casos de uso, autorização, transações e eventos.
3. **Domínio:** entidades, valores, estados e invariantes sem dependência de UI.
4. **Infraestrutura:** Prisma, autenticação, tempo real, arquivos e observabilidade.

## Fluxo de escrita

```text
UI → validação de formato → caso de uso
   → sessão + tenant → autorização
   → regra de domínio → transação no banco
   → AuditEvent/outbox → resposta/evento de atualização
```

## Segurança

- A autenticação usa nome de usuário normalizado e senha; e-mail não é credencial de acesso.
- Senhas usam `scrypt` com salt aleatório e comparação resistente a timing; nunca são armazenadas em texto puro.
- Sessões são persistidas no PostgreSQL com apenas o hash do token. O cookie é HTTP-only, Secure em produção, SameSite Lax, prioridade alta e validade de sete dias.
- Autorização ocorre no servidor em toda operação.
- Rate limiting em autenticação e operações abusáveis.
- Proteção CSRF quando aplicável ao modelo de sessão.
- Segredos apenas no servidor e fora do repositório.
- Logs não contêm senha, token ou dados de pagamento sensíveis.
- Auditoria é imutável para usuários comuns.

## Persistência e concorrência

Valores monetários serão armazenados em centavos inteiros ou `Decimal`, nunca `float`. Datas são persistidas em UTC e apresentadas no fuso do estabelecimento. Fechamento de conta, movimentação de caixa e estoque usam transações. Entidades disputadas terão controle otimista por versão quando necessário.

## Estado atual e migração

O protótipo mantém `RestaurantState` no navegador. A migração substitui o adaptador local por casos de uso e repositórios, preservando os fluxos da interface. Nenhum dado do `localStorage` será tratado como confiável no servidor.

## Fundação implementada

O esquema Prisma contém organização, estabelecimentos, associações, acesso a unidades, perfis, permissões, exceções, sessões, caixa, vendas, pagamentos e auditoria. O primeiro acesso cria atomicamente proprietário, organização, primeira unidade e associação ativa. O cadastro de produtos permanece explicitamente bloqueado até decisão funcional.

### Limitações do ambiente atual

- A produção usa PostgreSQL privado na Railway. O ambiente local ainda não possui PostgreSQL ativo porque o Docker depende da configuração do WSL.
- O audit do npm reporta vulnerabilidades transitivas no CLI do Prisma (`deepmerge-ts` e `mysql2`). Elas pertencem ao ferramental, não ao driver PostgreSQL usado pela aplicação. A correção automática oferecida faz downgrade incompatível e não foi aplicada; a versão deve ser reavaliada antes da implantação.
