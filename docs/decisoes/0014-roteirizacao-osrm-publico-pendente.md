# 0014 — Roteirização via OSRM público (auto-hospedagem pendente)

## Contexto

O rastreio de delivery usa o servidor de demonstração público do OSRM
(`router.project-osrm.org`) para calcular a rota real por ruas entre o
entregador e o destino, sem custo e sem chave de API. Essa é uma decisão
deliberada para o estágio atual do piloto (baixo volume de entregas).

## Risco conhecido

O servidor público do OSRM é mantido pela comunidade, sem SLA e sem
garantia de disponibilidade. Ele pode ficar lento, indisponível ou
bloquear o uso se o volume de chamadas crescer. Isso foi levantado
explicitamente com o cliente.

## Decisão

Por ora, seguir com o servidor público. Quando o volume de delivery
crescer ou o serviço público apresentar instabilidade, migrar para uma
instância própria do OSRM (ex.: um serviço Docker no Railway, com o
mapa da região do Betão pré-processado a partir de um extrato do
Geofabrik). A troca é de baixo risco técnico: a função `fetchRoute` em
`lib/osrm.ts` concentra toda a integração, então migrar significa
apenas trocar a URL base ali — nenhum outro arquivo depende do
provedor específico.

## Status

Pendente — aguardando crescimento do volume de delivery ou instabilidade
percebida no servidor público antes de justificar o custo mensal
recorrente de uma instância própria.
