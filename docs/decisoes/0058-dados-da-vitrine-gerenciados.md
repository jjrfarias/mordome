# ADR 0058: Dados da vitrine gerenciados pelo estabelecimento

- Estado: aceito
- Data: 2026-09-30

## Contexto

A vitrine do pedido online (ADR 0056) só exibe preço anterior, selo "Oferta", filtro vegetariano, telefone de contato e ordem de categorias quando esses dados existem no sistema. Até aqui o telefone e a ordem das categorias já tinham coluna no banco (`Establishment.phone`, `Category.sortOrder`), mas não havia tela para editá-los. Preço anterior e marcação vegetariana não existiam.

## Decisão

1. **Telefone da unidade** em Configurações → Estabelecimentos, junto do endereço. A API valida DDD + 8 ou 9 dígitos (`lib/phone.ts`), aceita vazio para remover e persiste só os dígitos. A vitrine recebe o número formatado e exibe "Contato" no menu.
2. **Ordem das categorias** pelo painel "Ordem das categorias no cardápio", em Configurações → Cardápio, com botões subir/descer. A API `GET/PUT /api/admin/categories` exige `catalog.manage`, deriva a organização da sessão e aceita apenas uma lista completa e sem repetição das categorias da organização (`isCompleteOrder`). Uma lista parcial ou com id de outra organização devolve 409. Cada `update` filtra também por `organizationId`, e a operação roda em transação com auditoria. A ordem vale para a organização inteira (a categoria é organizacional). As rotas públicas ordenam por `sortOrder`, depois pelo nome da categoria e então pelo nome do produto. No modo local a ordem fica em memória (`setLocalCategoryOrder`).
3. **Preço anterior ("de")** em `ProductOffering.compareAtPrice`, por unidade e canal, como o preço. É só apresentação: a cobrança e o recálculo do pedido continuam usando `price`. A regra "nulo ou maior que o preço" está em `compareAtPriceError` (comparação em centavos), é validada na API e na tela, e é reforçada por um `CHECK` no banco, para a vitrine nunca anunciar desconto inexistente (CDC). Quando o preço é alterado sem informar o preço anterior, o valor antigo só é mantido se continuar maior que o novo preço; caso contrário é removido.
4. **Vegetariano** em `Product.vegetarian`, definido pela organização e válido em todas as unidades. É uma declaração do estabelecimento, sem verificação pelo sistema.
5. **Migração aditiva** `20261017090000_vitrine_promocao_vegetariano_categorias`: uma coluna anulável, uma coluna com default e um `CHECK`. Nada é removido nem alterado. Deve ser aplicada com `prisma migrate deploy`, como as demais.

## Consequências

- A vitrine real passa a exibir selo "Oferta", preço riscado, filtro "Promoções", filtro "Vegetariano" e "Contato" assim que o estabelecimento preenche esses dados.
- A tela de edição do cardápio passou a mostrar o erro devolvido pela API; antes, uma falha ao salvar era silenciosa.
- Continuam fora do cadastro: avaliações, prazo estimado, retirada, cupom no pedido público, fidelidade, benefícios e textos institucionais da vitrine.

## Regras corporativas aplicadas

`AI_RULES/03_SECURITY_STANDARDS.md` §1–2 (organização derivada da sessão, filtro de tenant em toda escrita, permissão no backend), `04_ARCHITECTURE_STANDARDS.md` §5 e §7 (migração versionada e aditiva, invariante protegida no banco, frontend fora da regra de cobrança) e `02_COMPLIANCE_LEGAL.md` §5 (CDC: o preço anterior anunciado precisa ser verdadeiro).
