# ADR 0052: Endereço do estabelecimento com busca por CEP

- Estado: aceito
- Data: 2026-09-17

## Contexto

`Establishment` nunca teve nenhum campo de endereço — nem para uso interno (nota fiscal, exibição
na vitrine pública) nem para preencher automaticamente a origem no cálculo de distância do Delivery
Map. O dono precisava digitar o endereço à mão em qualquer lugar que precisasse dele.

## Decisão

1. **Sete campos novos em `Establishment`, todos opcionais** (`postalCode`, `street`, `number`,
   `complement`, `neighborhood`, `city`, `state`) — estruturados em vez de um único campo livre,
   mesmo padrão de granularidade de endereço usado por serviços de busca de CEP brasileiros, para
   permitir usar cada parte isoladamente no futuro (ex.: cidade num filtro, UF numa nota fiscal).
   Migração puramente aditiva.

2. **Busca automática por CEP via ViaCEP** (`https://viacep.com.br/ws/{cep}/json/`, API pública,
   gratuita, sem chave), chamada direto do navegador em Configurações → Estabelecimentos — só o CEP
   digitado é enviado, nenhum dado de cliente/tenant. Preenche rua/bairro/cidade/UF automaticamente;
   número e complemento continuam manuais (a ViaCEP não devolve isso). Primeira integração externa
   nova desde o mapa (Leaflet/OpenStreetMap), confirmada explicitamente com o usuário antes de
   implementar (regra 05_AI_AGENT_RULES.md, seção 2).

3. **CEP é normalizado para dígitos na gravação** (mesmo critério de telefone do ADR 0047), exibido
   formatado (`00000-000`) só na tela.

## Fora de escopo

Nenhum consumo automático desses campos ainda — não plugado no cálculo de distância do Delivery Map,
na vitrine pública (`/cardapio`, `/pedido-online`) nem em nota fiscal. Só o cadastro em si. Consumo
é uma fatia futura separada.
