# ADR 0009 — Usuários, perfis e acesso por unidade

## Status

Aceito e implementado na primeira fatia.

## Contexto

Uma organização pode operar vários estabelecimentos. A mesma pessoa pode exercer funções diferentes e, por exemplo, atender o salão e consultar o resumo financeiro ocasionalmente. Um perfil rígido por usuário não representa essa operação.

## Decisão

- O login cotidiano usa `username` e senha; e-mail não é identificador de acesso.
- O usuário se relaciona à organização por `OrganizationMembership` e às unidades por `EstablishmentAccess`.
- Uma associação pode acumular vários `CustomRole`; permissões de perfis ativos são somadas.
- `UserPermissionOverride` continua sendo a exceção individual: `DENY` prevalece sobre perfil e `ALLOW` acrescenta acesso.
- Perfis pertencem à organização e nunca podem ser usados por outra organização.
- A tela mostra a permissão efetiva, sua origem nos perfis e bloqueios/liberações individuais.
- Permissões para administrar a equipe são separadas em consulta, criação, suspensão, redefinição de senha e gestão de perfis.
- Um administrador não proprietário não pode conceder permissões que ele próprio não possui.
- O perfil de sistema `Proprietário` não pode ser editado ou desativado, e a organização deve manter ao menos um proprietário ativo.
- Suspender alguém altera a associação na organização, preservando usuário, vendas, caixas, atendimentos e auditoria.
- Redefinir senha invalida todas as sessões existentes do usuário.

## Auditoria

Criação de usuário/perfil, mudança de status, unidades, perfis e senha gera `AuditEvent`. Senhas e hashes nunca são gravados nos snapshots; a auditoria registra apenas que ocorreu uma redefinição.

## Modo local

O modo local oferece a mesma interface e mantém perfis/usuários em memória para validação visual. Esses dados reiniciam junto com o servidor e não substituem o PostgreSQL.

## Consequências

A autorização continua sendo validada no servidor. Esconder controles na interface melhora a experiência, mas não é uma barreira de segurança. Exceções individuais exigem justificativa, são registradas com antes/depois e entram no cálculo imediatamente.
