"use client";
import { useState } from "react";
import { Dialog } from "./primitives";
import { formatCents } from "@/lib/storefront/model";
import styles from "./storefront.module.css";

export type CustomerAccountData = { enabled: boolean; account: { name: string; phone: string } | null; totalOrders?: number; completedOrders?: number; orders?: { id: string; status: string; createdAt: string; totalCents: number; deliveryFee: number | null; items: { productName: string; quantity: number; unitPrice: number }[] }[] };
export function CustomerAccountDialog({ open, onClose, unit, data, onChanged }: { open: boolean; onClose: () => void; unit: string; data: CustomerAccountData; onChanged: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentAt, setSentAt] = useState(0);
  async function act(action: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/public/customers/${encodeURIComponent(unit)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, name, phone, code, challengeId: challenge }) });
      const result = await response.json(); if (!response.ok) throw Error(result.error ?? "Não foi possível continuar.");
      if (action === "REQUEST_CODE") { setChallenge(result.challengeId); setCode(""); setSentAt(Date.now()); }
      else { setChallenge(null); setCode(""); await onChanged(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha no acesso."); }
    finally { setBusy(false); }
  }
  const labels: Record<string, string> = { RECEIVED: "Recebido", PREPARING: "Em preparo", OUT_FOR_DELIVERY: "Saiu para entrega", DELIVERED: "Entregue", CANCELLED: "Cancelado" };
  return <Dialog open={open} onClose={() => { if (!busy) onClose(); }} title={data.account ? "Minha conta" : "Entrar com WhatsApp"}>
    {data.account ? <>
      <p>Olá, {data.account.name}.</p><p>{data.totalOrders ?? 0} pedidos · {data.completedOrders ?? 0} concluídos e pagos, sem estorno.</p>
      <p>Seu histórico nesta unidade inclui pedidos feitos enquanto você estava conectado.</p>
      <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void act("LOGOUT")}>Sair da conta</button>
      <h3>Meus pedidos</h3>
      {!data.orders?.length && <p>Você ainda não fez pedidos com esta conta.</p>}
      {data.orders?.map(order => <section key={order.id} className={styles.optionGroup}>
        <strong>#{order.id.slice(-6).toUpperCase()} · {labels[order.status]}</strong>
        <p>{new Date(order.createdAt).toLocaleString("pt-BR")}</p>
        {order.items.map((item, index) => <p key={index}>{item.quantity}× {item.productName}</p>)}
        <b>{formatCents(order.totalCents)}</b>
      </section>)}
    </> : <form onSubmit={event => { event.preventDefault(); void act(challenge ? "VERIFY_CODE" : "REQUEST_CODE"); }}>
      <p>Receba um código para acompanhar seus pedidos nesta unidade. Você também pode comprar sem cadastro.</p>
      <label className={styles.field}><span>Seu nome</span><input required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} autoComplete="name" disabled={busy} /></label>
      <label className={styles.field}><span>Celular com DDD</span><input required type="tel" autoComplete="tel-national" value={phone} onChange={event => { setPhone(event.target.value); setChallenge(null); }} disabled={busy} maxLength={20} /></label>
      {challenge && <><p>Código enviado pelo WhatsApp. Ele vale por cinco minutos.</p><label className={styles.field}><span>Código de seis dígitos</span><input required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} disabled={busy} /></label></>}
      <p>Usaremos seu telefone para confirmar o acesso e atender seus pedidos. Isso não autoriza mensagens promocionais.</p>
      <button className={styles.primaryButton} type="submit" disabled={busy}>{busy ? "Aguarde…" : challenge ? "Confirmar e entrar" : "Receber código no WhatsApp"}</button>
      {challenge && <button className={styles.ghostButton} type="button" disabled={busy} onClick={() => { if (Date.now() - sentAt < 60000) setError("Aguarde um minuto antes de reenviar."); else void act("REQUEST_CODE"); }}>Reenviar código</button>}
    </form>}
    {error && <p role="alert" className={styles.formError}>{error}</p>}
  </Dialog>;
}
