"use client";
import { useState } from "react";
import { Printer } from "lucide-react";
import { printReceipt } from "@/lib/integrations/print-client";

export async function requestDeliveryPrint(orderId: string, mode: "CONFERENCE" | "RECEIPT", discount = 0, reprint = false) {
  const response = await fetch("/api/operations/delivery/print", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, mode, discount, reprint }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error ?? "Não foi possível imprimir. Tente novamente.");
  if (typeof data.queued !== "boolean" || !data.receipt) throw Error("Resposta inválida da impressão. Atualize a página.");
  if (!data.queued) printReceipt(data.receipt, data.template);
  return data.message as string;
}
export function DeliveryPrintButton({ orderId, mode, discount = 0, disabled, reprint = false }: { orderId: string; mode: "CONFERENCE" | "RECEIPT"; discount?: number; disabled?: boolean; reprint?: boolean }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <div><button type="button" className="secondary" disabled={disabled || busy} onClick={async () => {
    setBusy(true); setMessage("");
    try { setMessage(await requestDeliveryPrint(orderId, mode, discount, reprint)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha na impressão."); }
    finally { setBusy(false); }
  }}><Printer/>{busy ? "Preparando impressão…" : mode === "CONFERENCE" ? "Imprimir conferência" : reprint ? "Reimprimir comprovante" : "Imprimir comprovante"}</button>{message && <p role="status">{message}</p>}</div>;
}
