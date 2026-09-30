# ADR 0056: Nova vitrine do pedido online

- Estado: aceito
- Data: 2026-09-30

## Contexto

A tela `/pedido-online/[establishmentId]` (ADRs 0045, 0051 e 0053) funcionava, mas era uma coluna única com a identidade operacional (verde/areia) e só a busca por nome. Chegou uma referência visual de vitrine para o consumidor final: cabeçalho branco, banner fotográfico, faixa de categorias, cards com foto, carrinho lateral fixo no desktop, banners inferiores e benefícios. A paleta pedida é vermelha (`#E21B23`), com tipografia Inter. O pedido também exigia busca, filtros combinados, favoritos, cupom, endereço, checkout e adaptação real para celular, sem inventar dados em produção.

## Decisão

1. **Tema próprio da vitrine, isolado por CSS Module.** `components/storefront/storefront.module.css` define os tokens da referência (`#FAF9F6`, `#E21B23`, `#C9141C`, `#ECECEC`, `#F5B34C`, `#FFF0D6`), e `app/pedido-online/layout.tsx` carrega a Inter por `next/font`. O painel operacional continua com `docs/IDENTIDADE-VISUAL.md`. É uma exceção consciente ao ADR 0055: a vitrine é uma superfície de consumo, não uma ferramenta operacional. A regra global `header{}` de `globals.css` é neutralizada no escopo do módulo.
2. **O backend existente continua sendo a fonte da verdade.** O `POST /api/public/orders/[id]` segue inalterado: recalcula preço, opções, área e taxa no servidor, aplica rate limit e usa `clientRequestId` como chave idempotente. O payload enviado pela vitrine não contém preço, taxa nem total. A chave idempotente fica estável enquanto o carrinho não muda, então um reenvio após falha de rede devolve o mesmo pedido. Uma resposta 409 recarrega o cardápio e revalida o carrinho.
3. **Os dados da vitrine ficam numa camada própria (`lib/storefront/`), em centavos inteiros.** `live-adapter.ts` converte a resposta da API (reais em `Decimal`) para centavos. `catalog.ts` cuida de busca sem acento, filtros, ordenação e ranking; `cart.ts` de carrinho, cupom, revalidação e leitura defensiva do armazenamento; `delivery.ts` da taxa pelo mesmo critério do servidor. Nada disso depende de React e tudo é coberto por `tests/storefront.test.ts`.
4. **Nenhum dado é inventado em produção.** Sem cadastro correspondente, a interface omite avaliação, preço anterior, selo "Oferta", filtro vegetariano, cupom (sem integração pública), fidelidade, benefícios, alegações institucionais ("embalagens recicláveis"), prazo estimado, retirada (o POST só registra entregas) e área de conta (não existe login de consumidor). O menu só mostra seções com destino real. Sem áreas de entrega cadastradas, a taxa aparece como "A confirmar"; com áreas, mas sem endereço, aparece como "A calcular". A taxa nunca é tratada como grátis.
5. **"Mais pedidos" vem de pedidos reais.** O `GET /api/public/orders/[id]` passou a devolver `popularProductIds`. É um ranking (só IDs, sem quantidades) por unidades de `DeliveryOrderItem` não cancelados dos últimos 60 dias, filtrado pelo estabelecimento e pelos produtos ofertados no canal. O produto precisa de pelo menos 5 unidades para entrar no ranking. O GET também devolve `phone` e `address` (dados comerciais públicos da unidade) para a seção Contato.
6. **Demonstração separada e explícita.** `/pedido-online/demonstracao` usa `lib/storefront/demo-data.ts`, que só é importado dinamicamente por essa rota, e as fotos de `public/vitrine-demo/`, com licença registrada em `CREDITOS.md`. Uma faixa fixa avisa que nenhum pedido é enviado ou cobrado. O checkout demonstrativo não faz chamada de rede e não pede dados de cartão. Em produção a rota responde 404, a menos que `STOREFRONT_DEMO_ENABLED=true`.
7. **Persistência no navegador mínima e isolada por estabelecimento.** O carrinho e os favoritos ficam em `localStorage`, com chave que inclui o `establishmentId`. As imagens em data URL não são copiadas para o armazenamento. O endereço fica só em `sessionStorage`, apagado ao fechar a aba. Nome e telefone nunca são persistidos. O conteúdo salvo é tratado como entrada não confiável: é validado, e depois revalidado contra o catálogo atual, com aviso ao cliente quando um item sai do cardápio ou muda de preço.
8. **Acessibilidade.** Os diálogos usam `<dialog>` nativo (foco preso, Esc, retorno de foco). Os avisos aparecem dentro do diálogo do topo para o botão "Desfazer" continuar clicável. Há rótulos em botões de ícone, foco visível, link para pular ao cardápio, carrossel sem rotação automática e respeito a `prefers-reduced-motion`.

## Consequências

- `app/pedido-online/[establishmentId]/page.tsx` virou um server component fino, e toda a interface fica em `components/storefront/`. O cardápio só de consulta (`/cardapio/[id]`) não foi alterado.
- Pendências que dependem do backend: cupom no pedido público (exige validação pública com rate limit e desconto em `DeliveryOrder`), retirada no balcão, prazo estimado por unidade, avaliações, preço anterior/promoção, marcação vegetariana, favoritos por cliente autenticado, programa de fidelidade e login do consumidor.
- O ranking faz um `groupBy` em `DeliveryOrderItem` a cada GET público. Se o volume crescer, criar um índice em `DeliveryOrderItem.deliveryOrderId` e/ou um cache curto.

## Regras corporativas aplicadas

`AI_RULES/04_ARCHITECTURE_STANDARDS.md` §7 (frontend não é fonte da verdade; centavos inteiros; idempotência), `03_SECURITY_STANDARDS.md` §2 (isolamento por tenant, aqui aplicado também ao armazenamento local), `02_COMPLIANCE_LEGAL.md` §1 e §3 (minimização de dados pessoais; imagens com licença verificada) e `docs/SEGURANCA.md` (nada sensível em `localStorage`).
