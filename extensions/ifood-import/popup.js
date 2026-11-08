/* global chrome */
import { captureIfoodOrder } from "./capture.js";
const input = document.getElementById("destination");
const button = document.getElementById("import");
const status = document.getElementById("status");
const saved = await chrome.storage.local.get("destination");
if (saved.destination) input.value = saved.destination;
button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    const destination = new URL(input.value.trim());
    if (destination.username || destination.password || (destination.protocol !== "https:" && !(destination.protocol === "http:" && ["localhost", "127.0.0.1"].includes(destination.hostname)))) throw Error("Use o endereço HTTPS do Mordomê.");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || new URL(tab.url).hostname !== "gestordepedidos.ifood.com.br") throw Error("Abra o pedido no Gestor do iFood antes de importar.");
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureIfoodOrder });
    if (!result?.result) throw Error("Não foi possível ler o pedido. Abra os detalhes e tente novamente.");
    const payload = JSON.stringify(result.result);
    if (payload.length > 50000) throw Error("Pedido muito grande para esta versão. Nenhum dado foi enviado.");
    await chrome.storage.local.set({ destination: destination.origin });
    // The fragment never travels in the HTTP request or Referer. The receiving page removes it immediately.
    await chrome.tabs.create({ url: `${destination.origin}/importar-ifood#${encodeURIComponent(payload)}` });
    status.textContent = "Conferência aberta no Mordomê. Confirme a loja, os itens e o pagamento.";
  } catch (error) { status.textContent = error.message || "Falha na leitura do pedido."; }
  finally { button.disabled = false; }
});
