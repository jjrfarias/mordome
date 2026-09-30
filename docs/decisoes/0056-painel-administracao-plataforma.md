# ADR 0056: Painel de administração da plataforma

## Contexto

Proprietários administram apenas sua própria organização. A operação SaaS precisa criar tenants, suspender ou liberar acesso e acompanhar indicadores de consumo sem transformar perfis comuns em administradores globais.

## Decisão

1. O painel fica em `/sistema` e usa `SystemAdmin` e `SystemAdminSession`, separados de `User` e `Session`.
2. Sessões administrativas duram 12 horas, usam cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.
3. Toda criação, suspensão e liberação de tenant gera `PlatformAuditEvent`, sem registrar senhas.
4. A criação de tenant é atômica: organização, unidade inicial, proprietário, acessos, perfil e permissões são gravados na mesma transação.
5. O bloqueio usa `Organization.active = false` e encerra as sessões dos usuários associados. Os dados não são excluídos.
6. O consumo inicial é calculado a partir dos dados reais: usuários, unidades, sessões ativas, vendas e receita do mês, pedidos de delivery e comandas abertas.
7. A primeira conta global é criada por `npm run system-admin:create`, usando variáveis de ambiente apenas durante o comando. Nenhuma credencial padrão fica no código ou no repositório.

## Evolução prevista

Planos, limites contratados, cobrança, armazenamento e quotas de integrações exigirão tabelas próprias quando os critérios comerciais forem definidos. Esta entrega mede uso real e mantém o controle de acesso necessário para essa evolução.
