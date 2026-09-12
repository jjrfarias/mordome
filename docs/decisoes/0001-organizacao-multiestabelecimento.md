# ADR 0001: Organização multiestabelecimento

- Estado: aceito
- Data: 2026-09-11

## Contexto

Um mesmo cliente pode operar mais de um bar ou restaurante e precisa administrar unidades individualmente e de forma consolidada.

## Decisão

Separar `Organization` de `Establishment`. A organização representa o cliente/assinatura; o estabelecimento representa a unidade operacional. Dados operacionais são escopados por estabelecimento e dados administrativos compartilhados por organização.

## Consequências

Toda autorização precisa verificar associação e acesso à unidade. Relatórios consolidados agregam somente unidades autorizadas. A interface mantém um seletor persistente de estabelecimento.
