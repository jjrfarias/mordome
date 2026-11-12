// Self-contained: Chrome serializes this function into the active tab.
export function capture99FoodOrder() {
  if (location.hostname !== "merchant.99app.com") throw Error("Abra o Gestor do 99Food.");
  const visible = el => el && el.getClientRects().length > 0;
  const read = el => visible(el) ? el.innerText.trim() : "";
  const roots = [...document.querySelectorAll(".detail-content, main.order-container__detail")].filter(el => visible(el) && el.querySelector(".items-wrapper"));
  if (roots.length !== 1) throw Error("Abra os detalhes de um único pedido do 99Food, com os itens expandidos.");
  const root = roots[0];
  const externalId = read(root.querySelector(".order-id")).match(/^ID:\s*(\d{10,24})(?:\s+Copiar)?$/i)?.[1];
  if (!externalId) throw Error("Não encontrei o ID completo do pedido 99Food. Reabra os detalhes.");
  const active = root.matches("main.order-container__detail");
  const stores = [...document.querySelectorAll(".layout-shop-name")].filter(visible).map(read);
  const storeName = active ? (stores.length === 1 ? stores[0] : "") : read(root.querySelector(".store-name__text"));
  const customer = root.querySelector(".receiver-info__name");
  const customerName = active ? (visible(customer) ? [...customer.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join("").trim() : "") : read(root.querySelector(".receiver-and-rider-info-wrapper .info-wrapper .text p"));
  const address = read(root.querySelector(active ? ".receiver-info__address-text" : ".receiver-address"));
  let status = read(root.querySelector(".receiver-and-rider-info-wrapper .status")) || read(root.querySelector(".timeline-title-container .title"));
  // A courier arriving is still a preparing order. Do not infer the current stage
  // from the full timeline: it also renders future delivery/completion steps.
  const preparing = active && read(root.querySelector(".accept-time")) && [...root.querySelectorAll("button")].some(button => read(button) === "Pedido preparado") && /^(?:Preparando|Em preparo|O pedido começou a ser preparado|Entregador chegou à loja)$/i.test(status);
  if (preparing) status = "Em preparo";
  if (active && !preparing) throw Error("Importe apenas um pedido aceito ainda em preparo, com o botão Pedido preparado disponível.");
  if (!storeName || !customerName || !status) throw Error("Loja, cliente ou status não identificado no 99Food. Não foi importado nenhum pedido.");
  // The long ID remains a string: converting 19 digits to Number loses precision.
  const header = root.closest(".history-detail-drawer__column")?.querySelector(".history-detail-drawer__title");
  const displayId = read(active ? root.querySelector(".index-number") : header).match(/^#(\d+)$/)?.[1] ?? externalId;
  const money = value => {
    const match = value.match(/^R\$\s*([\d.]+,\d{2})$/);
    if (!match) throw Error("Preço de item não reconhecido no 99Food.");
    return Math.round(Number(match[1].replaceAll(".", "").replace(",", ".")) * 100);
  };
  const items = [...root.querySelectorAll(".items-wrapper > .item")].filter(visible).map(item => {
    const main = item.querySelector(".food-item.main-item");
    const name = read(main?.querySelector(".name-text"));
    const quantity = Number(read(main?.querySelector(".count")).match(/^(\d+)\s*x$/i)?.[1]);
    if (!name || !Number.isInteger(quantity) || quantity < 1) throw Error("Item ou quantidade incompleta no 99Food.");
    const details = [read(item.querySelector(".subitem-part")), read(item.querySelector(".item-remark"))].filter(Boolean).join("\n");
    return { name, quantity, lineTotalCents: money(read(main?.querySelector(".final-price .value"))), details };
  });
  if (!items.length) throw Error("Não encontrei os itens do pedido 99Food. Expanda os detalhes.");
  const sourceText = root.innerText;
  // Only the gross item subtotal is captured. Merchant earnings are NEVER customer payment.
  const subtotalRows = [...root.querySelectorAll(".each-price")].filter(row => visible(row) && read(row.querySelector(".name-with-tip__text")) === "Preço total dos itens sem as ofertas");
  const subtotal = subtotalRows.length === 1 ? ["", read(subtotalRows[0].querySelector(".price"))] : !active ? sourceText.match(/Preço total dos itens sem as ofertas\s*(R\$\s*[\d.]+,\d{2})/i) : null;
  if (!subtotal) throw Error("Subtotal dos itens não encontrado no 99Food. Nenhum valor de repasse será usado como total.");
  const orderNotes = [...root.querySelectorAll(".items-wrapper > div > .remark .each-remark")].map(read).filter(Boolean).join("\n");
  return { version: 1, provider: "FOOD99", externalId, displayId, storeName, customerName,
    sourceStatus: status, address, fulfillment: "DELIVERY", payment: "UNKNOWN",
    deliveryFeeCents: 0, subtotalCents: money(subtotal[1].trim()), items, orderNotes, sourceText };
}
