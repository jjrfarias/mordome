# ADR 0002: Perfis personalizados e exceções

- Estado: aceito
- Data: 2026-09-11

## Contexto

Funções reais se sobrepõem. Um atendente pode ocasionalmente auxiliar no financeiro sem precisar receber todas as capacidades de gerente.

## Decisão

Adotar permissões atômicas, perfis personalizados por organização, acesso explícito a estabelecimentos e concessões/bloqueios individuais. Bloqueio individual prevalece no cálculo efetivo.

## Consequências

A interface administrativa deve explicar a origem de cada acesso. O servidor verifica permissões em toda ação. Alterações de acesso são auditadas e invalidam caches relacionados.
