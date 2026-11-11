import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getCounterTable } from "@/lib/counter-table";
import { areaNeighborhoods, findDeliveryAreaByNeighborhood } from "@/lib/delivery-area-match";
import { dispatchDeliveryWhatsAppAutomation } from "@/lib/whatsapp-automation";
import { normalizeWhatsAppText, parseNumberChoice, publicOrderUrl } from "@/lib/whatsapp-ordering-helpers";

const SESSION_HOURS = 24;
type CartLine = { productId: string; quantity: number };
type State =
  | { step: "MENU"; cart: CartLine[] }
  | { step: "CATEGORY"; cart: CartLine[]; categoryIds: string[] }
  | { step: "PRODUCT"; cart: CartLine[]; productIds: string[] }
  | { step: "NAME"; cart: CartLine[] }
  | { step: "ADDRESS"; cart: CartLine[]; name: string }
  | { step: "DONE"; cart: CartLine[]; orderId: string };

type Send = (text: string) => Promise<void>;
type CatalogProduct = { id: string; name: string; description: string | null; price: number; categoryId: string | null; categoryName: string; canOrderByWhatsApp: boolean };

function money(value: number) { return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function emptyState(): State { return { step: "MENU", cart: [] }; }
function readState(value: unknown): State {
  if (!value || typeof value !== "object" || !("step" in value) || !("cart" in value) || !Array.isArray((value as { cart: unknown }).cart)) return emptyState();
  return value as State;
}
function isMenu(value: string) { return /^(oi|ola|ol|menu|inicio|incio|cardapio|cardpio|pedido|ajuda|opcoes|opes)$/.test(value); }
function wantsLink(value: string) { return value.includes("link") || value.includes("site") || value.includes("pedido online"); }

async function catalog(establishmentId: string) {
  const offerings = await db.productOffering.findMany({
    where: { establishmentId, channel: "DELIVERY", active: true, variant: { active: true, product: { active: true } } },
    select: {
      price: true,
      variant: { select: { product: { select: {
        id: true, name: true, description: true, categoryId: true, isCombo: true,
        category: { select: { name: true, sortOrder: true } },
        ingredientGroups: { where: { active: true }, select: { minSelections: true } },
        comboGroups: { where: { active: true }, select: { minSelections: true } },
      } } } },
    },
    orderBy: [{ variant: { product: { category: { sortOrder: "asc" } } } }, { variant: { product: { name: "asc" } } }],
  });
  return offerings.map(offering => {
    const p = offering.variant.product;
    return ({ id: p.id, name: p.name, description: p.description, price: Number(offering.price), categoryId: p.categoryId, categoryName: p.category?.name ?? "Outros", canOrderByWhatsApp: !p.isCombo && p.ingredientGroups.every(group => group.minSelections === 0) && p.comboGroups.every(group => group.minSelections === 0) } satisfies CatalogProduct);
  });
}

async function cartSummary(establishmentId: string, cart: CartLine[]) {
  const products = await catalog(establishmentId);
  const byId = new Map(products.map(item => [item.id, item]));
  const lines = cart.flatMap(line => { const product = byId.get(line.productId); return product ? [{ ...line, product }] : []; });
  const total = lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0);
  return { lines, total };
}

async function showMenu(send: Send) {
  await send("Olá! 👋 Como prefere pedir?\n\n*1* Pelo WhatsApp — veja o cardápio e escolha os itens aqui\n*2* Pelo site — veja fotos e personalize os produtos\n\nResponda com *1* ou *2*.");
}

async function showCategories(establishmentId: string, state: State, send: Send): Promise<State> {
  const products = await catalog(establishmentId);
  const categories = [...new Map(products.map(product => [product.categoryId ?? `other:${product.categoryName}`, product])).values()];
  if (!categories.length) { await send("O cardápio está sendo atualizado. Tente novamente em alguns minutos."); return state; }
  await send(`*Cardápio*\n\n${categories.map((category, index) => `*${index + 1}* ${category.categoryName}`).join("\n")}\n\nResponda com o número da categoria. Para abrir o cardápio com fotos, envie *link*.`);
  return { step: "CATEGORY", cart: state.cart, categoryIds: categories.map(category => category.categoryId ?? `other:${category.categoryName}`) };
}

async function showProducts(establishmentId: string, state: Extract<State, { step: "CATEGORY" }>, choice: number, send: Send): Promise<State> {
  const categoryId = state.categoryIds[choice - 1];
  if (!categoryId) { await send("Escolha um número da lista de categorias."); return state; }
  const products = (await catalog(establishmentId)).filter(product => (product.categoryId ?? `other:${product.categoryName}`) === categoryId);
  await send(`*${products[0]?.categoryName ?? "Produtos"}*\n\n${products.map((product, index) => `${index + 1}. *${product.name}* — ${money(product.price)}${product.canOrderByWhatsApp ? "" : "\n   Personalize pelo site (envie *link*)"}${product.description ? `\n   ${product.description}` : ""}`).join("\n\n")}\n\nEnvie o número do produto. Para duas unidades do item 1, envie *2x 1*. Para voltar, envie *C*.`);
  return { step: "PRODUCT", cart: state.cart, productIds: products.map(product => product.id) };
}

async function finalizeOrder(establishmentId: string, phone: string, state: Extract<State, { step: "ADDRESS" }>, addressInput: string) {
  const parts = addressInput.split("|").map(part => part.trim());
  const address = parts[0] ?? "";
  const neighborhood = parts[1] ?? "";
  if (address.length < 5) return { error: "Informe o endereço completo." } as const;
  const activeAreas = await db.deliveryArea.findMany({ where: { establishmentId, active: true } });
  const configuredAreas = activeAreas.filter(area => areaNeighborhoods(area.neighborhoods).length > 0);
  if (configuredAreas.length && !neighborhood) return { error: "Informe também o bairro, separado por |. Ex.: Rua das Flores, 10 | Centro" } as const;
  const area = configuredAreas.length ? findDeliveryAreaByNeighborhood(configuredAreas, neighborhood) : null;
  if (configuredAreas.length && !area) return { error: "Ainda não entregamos no bairro informado. Confira o bairro ou envie *link* para consultar o endereço pelo site." } as const;
  if (activeAreas.length && !area) return { error: "A área de entrega não foi identificada. Informe endereço e bairro separados por |." } as const;
  const products = await catalog(establishmentId);
  const byId = new Map(products.map(product => [product.id, product]));
  const lines = state.cart.flatMap(line => { const product = byId.get(line.productId); return product && product.canOrderByWhatsApp ? [{ ...line, product }] : []; });
  if (!lines.length || lines.length !== state.cart.length) return { error: `Um item foi alterado ou exige personalização. Continue pelo site: ${publicOrderUrl(establishmentId)}` } as const;
  const establishment = await db.establishment.findFirst({ where: { id: establishmentId, active: true, organization: { active: true } }, select: { organizationId: true } });
  if (!establishment) return { error: "Esta unidade não está disponível no momento." } as const;
  const requestId = crypto.randomUUID();
  const deliveryFee = area ? Number(area.deliveryFee) : 0;
  const created = await db.$transaction(async tx => {
    const customer = await tx.customer.upsert({ where: { organizationId_phone: { organizationId: establishment.organizationId, phone } }, update: { name: state.name }, create: { organizationId: establishment.organizationId, name: state.name, phone } });
    const delivery = await tx.deliveryOrder.create({ data: { establishmentId, clientRequestId: requestId, customerName: state.name, customerPhone: phone, customerId: customer.id, address, origin: "ONLINE", deliveryAreaId: area?.id ?? null, deliveryFee, items: { create: lines.map(line => ({ productId: line.product.id, productName: line.product.name, quantity: line.quantity, unitPrice: line.product.price })) } }, include: { items: true } });
    const access = await tx.establishmentAccess.findFirst({ where: { establishmentId, membership: { organizationId: establishment.organizationId, status: "ACTIVE" } }, include: { membership: { select: { userId: true } } }, orderBy: { membership: { createdAt: "asc" } } });
    if (access) {
      const actorId = access.membership.userId;
      const table = await getCounterTable(tx, establishmentId);
      const tab = await tx.tab.create({ data: { establishmentId, tableId: table.id, openedById: actorId } });
      const tabItems = await Promise.all(delivery.items.map(item => tx.tabItem.create({ data: { tabId: tab.id, productId: item.productId, productName: item.productName, quantity: item.quantity, sentQuantity: item.quantity, unitPrice: item.unitPrice, addedById: actorId } })));
      const kitchen = await tx.order.create({ data: { tabId: tab.id, sentById: actorId, items: { create: tabItems.map((item, index) => ({ tabItemId: item.id, productName: delivery.items[index].productName, quantity: delivery.items[index].quantity })) }, statusHistory: { create: { status: "RECEIVED", actorId } } } });
      await tx.deliveryOrder.update({ where: { id: delivery.id }, data: { kitchenOrderId: kitchen.id } });
    }
    return delivery;
  });
  void dispatchDeliveryWhatsAppAutomation(created.id, "ORDER_RECEIVED").catch(() => {});
  return { order: created, total: lines.reduce((sum, line) => sum + line.quantity * line.product.price, 0), deliveryFee } as const;
}

export async function handleWhatsAppOrderingInbound(input: { establishmentId: string; phone: string; messageId: string; text: string }, send: Send) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  const text = normalizeWhatsAppText(input.text);
  if (!text || text.length > 500) return;
  const connection = await db.whatsAppConnection.findUnique({ where: { establishmentId: input.establishmentId }, select: { orderingEnabled: true } });
  if (!connection?.orderingEnabled) return;
  try { await db.whatsAppInboundReceipt.create({ data: { establishmentId: input.establishmentId, messageId: input.messageId, expiresAt } }); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return; throw error; }
  void db.whatsAppInboundReceipt.deleteMany({ where: { establishmentId: input.establishmentId, expiresAt: { lt: now } } }).catch(() => {});
  void db.whatsAppOrderingSession.deleteMany({ where: { establishmentId: input.establishmentId, expiresAt: { lt: now } } }).catch(() => {});
  const saved = await db.whatsAppOrderingSession.findUnique({ where: { establishmentId_phone: { establishmentId: input.establishmentId, phone: input.phone } } });
  let state = saved && saved.expiresAt > now ? readState(saved.state) : emptyState();
  if (/^(cancelar|cancel|sair|parar)$/.test(text)) { state = emptyState(); await showMenu(send); }
  else if (wantsLink(text)) await send(`Aqui está o cardápio com fotos e personalização:\n${publicOrderUrl(input.establishmentId)}\n\nSe preferir continuar por aqui, envie *menu*.`);
  else if (isMenu(text) || text === "1" && state.step === "MENU") state = await showCategories(input.establishmentId, state, send);
  else if ((text === "2" || text === "3") && state.step === "MENU") await send(`Aqui está o cardápio com fotos e personalização:\n${publicOrderUrl(input.establishmentId)}\n\nSe preferir pedir por aqui, envie *menu*.`);
  else if (state.step === "CATEGORY") { const choice = parseNumberChoice(text); state = choice ? await showProducts(input.establishmentId, state, choice.index, send) : state; if (!choice) await send("Responda com o número da categoria."); }
  else if (state.step === "PRODUCT") {
    if (/^f(inalizar)?$/.test(text)) { const summary = await cartSummary(input.establishmentId, state.cart); if (!summary.lines.length) await send("Sua sacola está vazia. Escolha uma categoria primeiro."); else { state = { step: "NAME", cart: state.cart }; await send(` Subtotal: *${money(summary.total)}*\n\nPara finalizar, informe seu nome completo.`); } } else if (/^(categorias|voltar|c)$/.test(text)) state = await showCategories(input.establishmentId, { step: "MENU", cart: state.cart }, send); else { const choice = parseNumberChoice(text); const productId = choice && state.productIds[choice.index - 1]; if (!choice || !productId) await send("Responda com o número de um produto da lista."); else { const product = (await catalog(input.establishmentId)).find(item => item.id === productId); if (!product?.canOrderByWhatsApp) await send(`Esse produto precisa de personalização. Escolha pelo site: ${publicOrderUrl(input.establishmentId)}`); else { const cart = [...state.cart]; const line = cart.find(item => item.productId === productId); if (line) line.quantity = Math.min(99, line.quantity + choice.quantity); else cart.push({ productId, quantity: choice.quantity }); const summary = await cartSummary(input.establishmentId, cart); await send(` Adicionado: *${product.name}*\n\n *Sacola*\n${summary.lines.map(item => `${item.quantity}x ${item.product.name}  ${money(item.product.price * item.quantity)}`).join("\n")}\n\nSubtotal: *${money(summary.total)}*\n\nEnvie outro número, *C* para categorias ou *F* para finalizar.`); state = { step: "PRODUCT", cart, productIds: state.productIds }; } } }
  }
  else if (state.step === "NAME") { if (input.text.trim().length < 2 || input.text.trim().length > 100) await send("Informe seu nome completo para confirmar o pedido."); else { state = { step: "ADDRESS", cart: state.cart, name: input.text.trim() }; await send("Agora informe o endereço e o bairro separados por *|*.\nEx.: Rua das Flores, 120, apto 2 | Centro"); } }
  else if (state.step === "ADDRESS") { const result = await finalizeOrder(input.establishmentId, input.phone, state, input.text.trim()); if ("error" in result) await send(result.error ?? "Não foi possível concluir o pedido."); else { await send(` Pedido *#${result.order.id.slice(-6).toUpperCase()}* recebido!\n\nSubtotal: ${money(result.total)}\nTaxa de entrega: ${result.deliveryFee ? money(result.deliveryFee) : "a confirmar"}\n\nO estabelecimento confirmará o pagamento e o preparo.`); state = { step: "DONE", cart: state.cart, orderId: result.order.id }; } }
  else if (state.step === "DONE") { await showMenu(send); state = emptyState(); }
  else { await showMenu(send); }
  await db.whatsAppOrderingSession.upsert({ where: { establishmentId_phone: { establishmentId: input.establishmentId, phone: input.phone } }, create: { establishmentId: input.establishmentId, phone: input.phone, state, expiresAt }, update: { state, expiresAt } });
}
