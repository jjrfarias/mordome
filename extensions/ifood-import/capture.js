// Self-contained: Chrome serializes this function into the active tab.
export function captureIfoodOrder() {
  if (location.hostname !== "gestordepedidos.ifood.com.br") throw Error("Abra o Gestor de Pedidos do iFood.");
  const panels = [...document.querySelectorAll(".OrderDetails__content")].filter(el => el.getClientRects().length);
  if (panels.length !== 1) throw Error("Abra os detalhes de um único pedido no Gestor.");
  const root = panels[0];
  const text = root.innerText;
  const externalId = location.hash.match(/\/([0-9a-f]{8}-[0-9a-f-]{27})(?:[/?]|$)/i)?.[1];
  if (!externalId) throw Error("Não encontrei o identificador único do pedido. Reabra os detalhes.");
  const heading = root.querySelector("h2")?.innerText.trim();
  const match = heading?.match(/^(\d+)\s+([\s\S]+)$/);
  if (!match) throw Error("Não consegui identificar o número e o cliente.");
  const money = value => {
    const found = value?.match(/R\$\s*([\d.]+,\d{2})/);
    if (!found) throw Error("Preço não reconhecido. Não foi importado nenhum pedido.");
    return Math.round(Number(found[1].replaceAll(".", "").replace(",", ".")) * 100);
  };
  const prices = [...root.querySelectorAll('[data-test-id="item-price"]')];
  const items = prices.map(price => {
    const section = price.closest(".SectionItem");
    const header = section?.querySelector(":scope > .SectionItem__header");
    const name = header?.querySelector(".SectionItem__label--title")?.innerText.trim();
    const quantity = Number(header?.querySelector("[data-quantity]")?.getAttribute("data-quantity"));
    const body = section?.querySelector(":scope > .SectionItem__body");
    let details = body?.innerText.trim() ?? "";
    // Some extra quantities are CSS-generated just like the main quantity.
    const extras = body ? [...body.querySelectorAll("[data-quantity]")].map(el => {
      const extraSection = el.closest(".SectionItem");
      const label = extraSection && body.contains(extraSection) ? extraSection.querySelector(".SectionItem__label")?.innerText.trim() : "";
      const count = Number(el.getAttribute("data-quantity"));
      if (!label || !Number.isInteger(count) || count < 1) throw Error("Não consegui associar a quantidade de um adicional. Confira este formato antes de importar.");
      return `${count} × ${label}`;
    }) : [];
    if (extras.length) details += `\nQuantidades dos adicionais: ${extras.join("; ")}`;
    if (!name || !Number.isInteger(quantity) || quantity < 1) throw Error("Um item está incompleto. Confira o pedido no Gestor.");
    return { name, quantity, lineTotalCents: money(price.innerText), details };
  });
  if (!items.length || items.length > 100) throw Error("Não consegui ler os itens deste pedido.");
  const delivery = root.querySelector(".DetailsDeliverySectionItem")?.innerText.trim() ?? "";
  const status = root.querySelector(".OrderDetails__status-info h3")?.innerText.trim() ?? "";
  if (!status) throw Error("Não consegui identificar o status do pedido.");
  const payment = /Pago via iFood, não precisa cobrar na entrega/i.test(text) ? "PAID_ONLINE" : /(?:cobrar na entrega|pagamento na entrega|pagar na entrega)/i.test(text) ? "PAY_ON_DELIVERY" : "UNKNOWN";
  const deliveryFeeMatch = text.match(/Taxa de entrega\s*\n\s*(R\$\s*[\d.]+,\d{2})/i);
  const subtotalMatch = text.match(/Subtotal\s*\n\s*(R\$\s*[\d.]+,\d{2})/i);
  if (!subtotalMatch) throw Error("Subtotal não encontrado. Confira o formato do pedido.");
  const store = [...document.querySelectorAll("button")].find(el => /Loja (aberta|fechada)/i.test(el.innerText))?.innerText.replace(/Loja (aberta|fechada)/i, "").trim() ?? "";
  const orderNotes = [...root.querySelectorAll(".SectionItem")].filter(el => !el.querySelector('[data-test-id="item-price"]') && /^observa[çc][aã]o|^observa[çc][oõ]es/i.test(el.querySelector(".SectionItem__label")?.innerText.trim() ?? "")).map(el => el.innerText.trim()).join("\n");
  return {
    version: 1, externalId: externalId.toLowerCase(), displayId: match[1], customerName: match[2].trim(),
    storeName: store, sourceStatus: status, address: delivery, payment,
    fulfillment: /retirada/i.test(delivery) ? "PICKUP" : "DELIVERY",
    deliveryFeeCents: deliveryFeeMatch ? money(deliveryFeeMatch[1]) : 0,
    subtotalCents: money(subtotalMatch[1]), items, orderNotes, sourceText: text,
  };
}
