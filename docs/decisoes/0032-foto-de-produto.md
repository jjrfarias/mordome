# ADR 0032: Foto de produto

- Estado: aceito
- Data: 2026-09-16

## Contexto

Nenhum produto do Mordomê tem foto hoje — nem no cadastro admin (`components/admin/CatalogManagement.tsx`), nem no cardápio público (`app/cardapio/[establishmentId]/page.tsx`), nem no pedido online (`app/pedido-online/[establishmentId]/page.tsx`), nem no PDV/Salão (`app/page.tsx`, `components/operations/FloorManagement.tsx`), que hoje usam um emoji fixo por categoria como substituto visual. Concorrentes (Saipos, Anota AI, iFood) usam foto de produto como recurso central de venda. O dono do produto confirmou a lacuna e quer o Mordomê melhor nessa experiência.

`Product` já foi estendido antes por Grupos de ingrediente (ADR 0022) sem mudar sua identidade central — foto de produto segue o mesmo padrão: mais um campo opcional em `Product`, sem novo modelo.

## Decisões

1. **Base64 no banco, não storage de objeto externo.** Não há infraestrutura de S3/Cloudinary/Vercel Blob configurada nesta base, e configurá-la está fora do escopo desta fatia (restrição explícita do pedido). `Product.imageUrl String?` guarda a data URL completa (`data:image/jpeg;base64,...`). **Limitação conhecida e aceita**: o banco cresce proporcionalmente ao volume de fotos, e não há CDN/cache de borda para servir as imagens — cada carregamento de cardápio busca a imagem embutida na resposta da API. Migrar para um storage de objeto de verdade (com URL pública e CDN) é melhoria futura, quando o volume de produtos com foto justificar o investimento em infraestrutura.

2. **Compressão obrigatória no navegador antes do envio.** `lib/image-compression.ts` expõe `calculateResizedDimensions` (função pura, testada em `tests/image-compression.test.ts`: mantém proporção, limita a 800px no maior lado, nunca amplia imagem menor) e `compressImageFile` (usa `<canvas>`, não testável em Node por depender de APIs de DOM — por isso a lógica de dimensão foi extraída à parte). A imagem é redimensionada para no máximo 800px no maior lado e reexportada como JPEG qualidade 0.7 antes de virar a data URL enviada ao servidor. Isso mantém o tamanho típico de uma foto de produto (ex.: cachorro-quente, lanche) bem abaixo do limite do servidor, mesmo vindo de uma foto de celular de vários MB.

3. **Limite de tamanho no servidor, mesmo com compressão do cliente.** Cliente não é confiável (bug no navegador, chamada direta à API, imagem já grande que escapou da compressão). `lib/catalog-validation.ts` define `PRODUCT_IMAGE_URL_MAX_LENGTH = 700_000` caracteres e o schema zod `productImageUrlSchema` usado em `POST`/`PATCH /api/admin/catalog`. Conta: a meta de compressão é ~500KB binário; base64 infla o tamanho em ~33% (500_000 × 4/3 ≈ 666_667 caracteres), mais o prefixo `data:image/jpeg;base64,` (~25 caracteres). 700_000 caracteres dá folga confortável sobre essa meta sem deixar passar uma imagem gigante que burlou a compressão do cliente. O schema também exige que o valor comece com `data:image/`, rejeitando URLs externas ou lixo. Testado em `tests/product-image.test.ts` (aceita dentro do limite, rejeita acima do limite, rejeita formato inválido).

4. **PATCH distingue "não mexer na foto" de "remover a foto".** `imageUrl` ausente no PATCH mantém a foto atual (comportamento padrão, sem regressão); `imageUrl: null` remove a foto existente; uma nova data URL troca a foto. Isso evita o padrão comum de "enviar tudo de novo" forçar o usuário a reenviar a foto a cada edição de preço/canal.

5. **Pontos de exibição cobertos, todos com fallback quando não há foto:**
   - Cardápio público (`app/cardapio/[establishmentId]/page.tsx`) e pedido online (`app/pedido-online/[establishmentId]/page.tsx`): nova classe `.public-menu-item-photo` com ícone `UtensilsCrossed` (lucide-react) como placeholder.
   - PDV (`app/page.tsx`, componente `Pos`): `.pos-product>span` e `.food` (carrinho) trocam o emoji por `<img>` quando `imageUrl` existe; emoji continua como fallback.
   - Salão (`components/operations/FloorManagement.tsx`, grade de produtos da comanda): mesma lógica de fallback com `.product-card>span`.
   - Cadastro admin (`components/admin/CatalogManagement.tsx`): upload com preview, usando o mesmo placeholder (`UtensilsCrossed`) quando não há foto ainda.

   **Não coberto nesta fatia**: item já lançado na comanda/carrinho do Salão (`ticket-item`, `.food` dentro de `CommandView`) não recebe foto, porque a API de salão (`/api/operations/floor`) não devolve `imageUrl` por item de comanda — só o catálogo de produtos disponíveis para adicionar. Ficou de fora por não ser o ponto de decisão de compra (o produto já foi escolhido); pode ser revisto se o dono quiser fotos também ali.

6. **Permissão reaproveitada: `catalog.manage`.** Já controla `CatalogManagement.tsx` por inteiro; upload de foto é mais um campo do mesmo formulário de produto, não uma capacidade nova.

7. **Migração manual.** `prisma/migrations/20260925090000_foto_de_produto/migration.sql` segue o padrão das migrações recentes (`ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT`), e deve ser aplicada com `npx prisma migrate deploy` antes de liberar em produção. `npx prisma generate` foi executado com sucesso apontando para o `DATABASE_URL` local.

8. **Modo local também suporta `imageUrl`.** `lib/local-catalog.ts` guarda `imageUrl: string | null` no registro do produto (não por oferta/estabelecimento, já que a foto é do produto, não da oferta). `createLocalCatalogProduct`/`updateLocalCatalogProduct` recebem os campos permitidos explicitamente desestruturados no chamador (nunca o objeto `data` inteiro) — ver nota de risco recorrente abaixo.

## Risco recorrente evitado

Em modo local, o padrão de bug já corrigido várias vezes nesta branch é repassar `data` inteiro (incluindo o campo identificador) para `updateLocalX(scopeId, data.algumId, data)`. Em `app/api/admin/catalog/route.ts`, o `PATCH` agora desestrutura explicitamente `{ price, channels, imageUrl }` de `parsed.data` antes de repassar para `updateLocalCatalogProduct`, e o `POST` desestrutura `{ name, category, price, channels, imageUrl }` antes de `createLocalCatalogProduct` — nenhum dos dois passa `parsed.data` bruto.

## Consequências

- Produtos podem ganhar foto no cadastro e ela aparece automaticamente no cardápio público, pedido online, PDV e Salão, sem infraestrutura nova.
- Produtos sem foto continuam exatamente como antes (emoji no PDV/Salão, ícone de prato no cardápio/pedido online) — sem quebra de layout nem regressão nos fluxos já testados.
- O banco de dados passa a crescer com o volume de fotos cadastradas; não há CDN, cache de borda nem otimização de entrega de imagem. Se o volume de produtos com foto crescer muito (ex.: centenas de produtos por unidade, múltiplas unidades), migrar para um storage de objeto real com URL pública deve ser priorizado — decisão consciente de adiar esse investimento até haver sinal de necessidade.
- Item já adicionado à comanda do Salão não mostra foto — ponto explicitamente fora de escopo, documentado acima.
