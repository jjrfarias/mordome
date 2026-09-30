// DADOS DEMONSTRATIVOS — usados somente pela rota /pedido-online/demonstracao (ADR 0056).
// Avaliações, popularidade, preços anteriores, cupom, prazo, lojas e benefícios abaixo são fictícios
// e existem apenas para apresentar a vitrine. Nunca importar este módulo no fluxo real de pedidos.

import type { CartLine } from "./cart.ts";
import type { DeliveryAddress, StorefrontData } from "./model.ts";

const photo = (file: string) => `/vitrine-demo/${file}.jpg`;

export const demoStorefront: StorefrontData = {
  mode: "demo",
  storeKey: "demonstracao",
  establishment: { name: "Mordomê Demonstração", logoUrl: null, phone: null, address: "Rua das Flores, 123 · Centro, São Paulo - SP" },
  slides: [
    { id: "burgers", kicker: "Sabor em cada momento", title: "Burgers artesanais", highlight: "com até 25% OFF", description: "Ingredientes selecionados. Sabor que entrega.", imageUrl: photo("hamburguer-artesanal"), imageAlt: "Cheeseburger artesanal com cheddar derretido", ctaLabel: "Pedir agora", target: { kind: "category", categoryId: "hamburgueres" } },
    { id: "pizza", kicker: "Direto do forno", title: "Pizza Margherita", highlight: "a mais pedida da casa", description: "Molho de tomate, muçarela e manjericão fresco.", imageUrl: photo("pizza-margherita"), imageAlt: "Pizza margherita com manjericão", ctaLabel: "Ver pizza", target: { kind: "product", productId: "demo-pizza-margherita" } },
    { id: "combos", kicker: "Para matar a fome", title: "Combo Clássico", highlight: "burger, batata e bebida", description: "Você escolhe a bebida.", imageUrl: photo("combo-classico"), imageAlt: "Hambúrguer com batatas fritas e refrigerante", ctaLabel: "Ver combos", target: { kind: "category", categoryId: "combos" } },
  ],
  categories: [
    { id: "pizzas", name: "Pizzas" },
    { id: "hamburgueres", name: "Hambúrgueres" },
    { id: "massas", name: "Massas" },
    { id: "bebidas", name: "Bebidas" },
    { id: "sobremesas", name: "Sobremesas" },
    { id: "combos", name: "Combos" },
    { id: "saudaveis", name: "Saudáveis" },
  ],
  products: [
    { id: "demo-pizza-margherita", name: "Pizza Margherita", description: "Molho de tomate, muçarela, manjericão e um toque de azeite.", categoryId: "pizzas", priceCents: 4990, compareAtPriceCents: null, imageUrl: photo("pizza-margherita"), rating: { average: 4.8, count: 320 }, popularityRank: 1, vegetarian: true, optionGroups: [
      { id: "demo-borda", name: "Borda recheada", minSelections: 0, maxSelections: 1, options: [{ id: "demo-borda-catupiry", name: "Borda de requeijão", priceDeltaCents: 800 }, { id: "demo-borda-cheddar", name: "Borda de cheddar", priceDeltaCents: 800 }] },
    ] },
    { id: "demo-cheeseburger", name: "Cheeseburger Clássico", description: "Pão brioche, blend 180g, cheddar, alface e tomate.", categoryId: "hamburgueres", priceCents: 2890, compareAtPriceCents: 3890, imageUrl: photo("hamburguer-artesanal"), rating: { average: 4.9, count: 512 }, popularityRank: 2, vegetarian: false, optionGroups: [
      { id: "demo-adicionais", name: "Adicionais", minSelections: 0, maxSelections: 3, options: [{ id: "demo-bacon", name: "Bacon", priceDeltaCents: 500 }, { id: "demo-cheddar-extra", name: "Cheddar extra", priceDeltaCents: 400 }, { id: "demo-ovo", name: "Ovo", priceDeltaCents: 300 }] },
    ] },
    { id: "demo-penne", name: "Penne ao Pomodoro", description: "Penne com molho de tomate italiano, parmesão e manjericão.", categoryId: "massas", priceCents: 3690, compareAtPriceCents: null, imageUrl: photo("penne-pomodoro"), rating: { average: 4.7, count: 189 }, popularityRank: 3, vegetarian: true, optionGroups: [] },
    { id: "demo-petit-gateau", name: "Petit Gateau", description: "Bolinho de chocolate com recheio cremoso e sorvete de baunilha.", categoryId: "sobremesas", priceCents: 2490, compareAtPriceCents: null, imageUrl: photo("petit-gateau"), rating: { average: 4.9, count: 274 }, popularityRank: 4, vegetarian: true, optionGroups: [] },
    { id: "demo-batata-rustica", name: "Batata Rústica", description: "Batatas em gomos, crocantes por fora e macias por dentro, com alecrim.", categoryId: "hamburgueres", priceCents: 1690, compareAtPriceCents: null, imageUrl: photo("batata-rustica"), rating: { average: 4.6, count: 143 }, popularityRank: 5, vegetarian: true, optionGroups: [] },
    { id: "demo-coca-cola", name: "Coca-Cola 350 ml", description: "Lata gelada.", categoryId: "bebidas", priceCents: 690, compareAtPriceCents: null, imageUrl: photo("refrigerante-lata"), rating: null, popularityRank: 6, vegetarian: true, optionGroups: [] },
    { id: "demo-combo-classico", name: "Combo Clássico", description: "Cheeseburger Clássico, Batata Rústica e uma bebida à sua escolha.", categoryId: "combos", priceCents: 4590, compareAtPriceCents: 5270, imageUrl: photo("combo-classico"), rating: { average: 4.8, count: 88 }, popularityRank: null, vegetarian: false, optionGroups: [
      { id: "demo-combo-bebida", name: "Bebida", minSelections: 1, maxSelections: 1, options: [{ id: "demo-combo-coca", name: "Coca-Cola 350 ml", priceDeltaCents: 0 }, { id: "demo-combo-guarana", name: "Guaraná 350 ml", priceDeltaCents: 0 }, { id: "demo-combo-agua", name: "Água sem gás 500 ml", priceDeltaCents: 0 }] },
    ] },
    { id: "demo-bowl-verde", name: "Bowl Verde", description: "Abacate, pepino, folhas, amendoim, gergelim e molho cítrico.", categoryId: "saudaveis", priceCents: 3490, compareAtPriceCents: null, imageUrl: photo("bowl-verde"), rating: { average: 4.7, count: 64 }, popularityRank: null, vegetarian: true, optionGroups: [] },
  ],
  deliveryAreas: [
    { id: "demo-area-centro", name: "Centro", feeCents: 690, neighborhoods: null },
    { id: "demo-area-sul", name: "Zona Sul", feeCents: 890, neighborhoods: null },
    { id: "demo-area-norte", name: "Zona Norte", feeCents: 990, neighborhoods: null },
  ],
  estimatedDeliveryTime: "25 - 35 min",
  pickupSupported: true,
  coupons: [{ code: "BEMVINDO10", kind: "PERCENT", value: 10, minSubtotalCents: 3000 }],
  paymentMethods: ["Pix na entrega", "Cartão na entrega", "Dinheiro"],
  comboPromo: { title: "Combos que combinam com você", text: "Mais sabor, mais economia.", ctaLabel: "Ver combos", imageUrl: photo("combo-classico"), target: { kind: "category", categoryId: "combos" } },
  loyalty: { title: "Seja um membro Mordomê", text: "Acumule pontos, ganhe descontos e tenha acesso a ofertas exclusivas.", ctaLabel: "Quero participar", details: ["A cada R$ 1 em pedidos, você acumula 1 ponto.", "100 pontos viram R$ 10 de desconto no próximo pedido.", "Membros recebem ofertas antes de todo mundo."] },
  benefits: [
    { icon: "food", title: "Comida de verdade", text: "Ingredientes selecionados" },
    { icon: "delivery", title: "Entrega rápida", text: "Direto na sua casa" },
    { icon: "payment", title: "Pagamento seguro", text: "Seus dados protegidos" },
    { icon: "support", title: "Atendimento humanizado", text: "Aqui você fala com pessoas" },
  ],
  sustainabilityNote: "Você está ajudando um futuro mais verde! Nossas embalagens são recicláveis.",
  about: "O Mordomê Demonstração é um restaurante fictício criado para apresentar a vitrine de pedidos online do Mordomê: cardápio, carrinho e checkout funcionando de ponta a ponta, sem enviar pedidos reais.",
  stores: [
    { name: "Unidade Centro", address: "Rua das Flores, 123 · Centro, São Paulo - SP", hours: "Todos os dias, 11h às 23h" },
    { name: "Unidade Zona Sul", address: "Avenida das Palmeiras, 450 · Vila Mariana, São Paulo - SP", hours: "Terça a domingo, 18h às 23h" },
  ],
};

export const demoSampleAddress: DeliveryAddress = { postalCode: "01000-000", street: "Rua das Flores", number: "123", complement: "", neighborhood: "Centro", city: "São Paulo", state: "SP", latitude: null, longitude: null, areaId: "demo-area-centro" };

// Reproduz o pedido da referência visual: subtotal R$ 52,70 + entrega R$ 6,90 = R$ 59,60.
export function demoSampleCart(createId: () => string): CartLine[] {
  const pick = (productId: string) => demoStorefront.products.find(product => product.id === productId)!;
  return ["demo-cheeseburger", "demo-batata-rustica", "demo-coca-cola"].map(productId => {
    const product = pick(productId);
    return { lineId: createId(), productId, name: product.name, imageUrl: product.imageUrl, unitPriceCents: product.priceCents, quantity: 1, selections: [], optionLabels: [] };
  });
}
