# ADR 0053: Vitrine do delivery (logo, banner e produto em destaque)

- Estado: aceito
- Data: 2026-09-17

## Contexto

As telas públicas (`/cardapio`, `/pedido-online`) sempre usaram um logo fixo hardcoded
(`/clientes/betao/simbolo-compacto-v1.png`), sem banner de capa nem forma de o dono destacar um
produto específico (ex.: "Burger do mês") — gap identificado comparando com a referência de um
concorrente (Saipos/Bucaneiros Burger), que tem os três elementos.

## Decisão

1. **Quatro campos novos em `Establishment`**: `logoUrl`, `bannerUrl` (mesmo formato data URL
   comprimida client-side do ADR 0032, reaproveitando `compressImageFile`/
   `PRODUCT_IMAGE_URL_MAX_LENGTH`), `highlightProductId` (FK opcional para `Product`, `onDelete:
   SetNull` — se o produto for excluído, o destaque só some, não quebra nada) e `highlightHeadline`
   (texto livre curto, ex.: "Burger do mês!"). Migração aditiva.

2. **Sem produto em destaque, sem seção nenhuma** — não força um "destaque" genérico. Com produto
   configurado, aparece um bloco de call-to-action no topo do cardápio/pedido online mostrando foto,
   nome, preço e a chamada configurada; no pedido online, clicar no bloco já adiciona 1 unidade ao
   carrinho (mesmo produto, sem duplicar lógica de carrinho).

3. **Editor em Configurações → Estabelecimentos**, mesmo padrão visual do endereço (ADR 0052):
   bloco recolhido mostra resumo ("Vitrine configurada"/"não configurada"), expande para editar.
   Upload de logo/banner reaproveita o componente de foto de produto (`compressImageFile`, câmera do
   celular ou galeria via `<input type="file" accept="image/*">`), sem endpoint de upload dedicado —
   mesma estratégia de armazenar como data URL no próprio registro, sem storage de objeto externo.

4. **Seletor de produto em destaque reaproveita `GET /api/admin/catalog`** (lista de produtos da
   unidade ativa na sessão) — simplificação aceita: o dono normalmente configura a unidade em que
   está logado; nome/id do produto são os mesmos entre unidades da mesma organização, só preço/
   canais variam (não usados no seletor).

5. **`GET /api/public/menu/[id]` e `GET /api/public/orders/[id]` passam a incluir
   `logoUrl`/`bannerUrl`/`highlightHeadline`/`highlightProduct`** no objeto `establishment` — sem
   endpoint novo, os dois pontos de entrada público já existentes ganharam os campos extras.

## Consequências

- Logo/banner por unidade: cada estabelecimento pode ter sua própria identidade visual na vitrine
  pública, em vez do logo fixo do Betão hardcoded no componente.
- Sem redimensionamento dedicado para banner (usa o mesmo limite de 800px do produto) — pode ficar
  com menos nitidez num banner muito largo; ajuste fino de proporção/qualidade fica para o dono
  escolher uma imagem já em formato paisagem.
