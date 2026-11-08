"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ifoodCaptureSchema, ifoodImportProblem, ifoodPaymentLabel, type IfoodCapture } from "@/lib/ifood-import";
import "./style.css";

type Session = { establishment: { id: string; name: string }; canOperateDelivery: boolean };
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export default function ImportIfoodPage() {
  const [order, setOrder] = useState<IfoodCapture | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [loaded, setLoaded] = useState(false);
  const initialized = useRef(false);
  async function loadSession() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const body = await response.json();
      setSession(response.ok ? body.session : null);
    } catch { setError("Não foi possível verificar o acesso ao Mordomê."); }
    finally { setLoaded(true); }
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fragment = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(() => {
      try {
        if (!fragment || fragment.length > 180000) throw Error("Abra um pedido no Gestor e clique na extensão Mordomê para importar.");
        const parsed = ifoodCaptureSchema.safeParse(JSON.parse(decodeURIComponent(fragment)));
        if (!parsed.success) throw Error("A captura está incompleta. Reabra o pedido e tente novamente.");
        setOrder(parsed.data);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Captura inválida."); }
      void loadSession();
    });
  }, []);
  const problem = order ? ifoodImportProblem(order) : null;
  async function importOrder() {
    if (!order || !session || !confirmed || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/integrations/ifood-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ establishmentId: session.establishment.id, order, confirmed: true }) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error ?? "Falha na importação.");
      setResult(body.duplicate ? `O pedido #${order.displayId} já está no Mordomê. Nenhuma cópia foi criada.` : `Pedido #${order.displayId} importado e enviado à cozinha.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na importação. Você pode tentar novamente."); }
    finally { setBusy(false); }
  }
  return <main className="ifood-import-page">
    <header><span>MORDOMÊ · IFOOD</span><h1>Conferir pedido</h1><p>Confira os dados capturados antes de enviar para produção.</p></header>
    {error && <p role="alert" className="ifood-warning">{error}</p>}
    {loaded && !session && <section><h2>Entre no Mordomê</h2><p>Abra o sistema em outra aba, entre na conta da loja e volte aqui.</p><a href="/" target="_blank" rel="noopener noreferrer">Abrir Mordomê</a> <button onClick={() => void loadSession()}>Já entrei — verificar acesso</button></section>}
    {session && <section><h2>Destino: {session.establishment.name}</h2>{!session.canOperateDelivery && <p role="alert">Seu usuário não tem permissão para operar delivery.</p>}</section>}
    {result ? <section role="status"><h2>{result}</h2><Link href="/">Voltar ao Mordomê</Link></section> : order && <>
      <section><div className="ifood-heading"><h2>iFood #{order.displayId}</h2><strong>{order.customerName}</strong></div><p>Loja no Gestor: <b>{order.storeName}</b></p><p>Status no Gestor: {order.sourceStatus}</p><p className="ifood-payment">{ifoodPaymentLabel(order.payment)}</p><p>{order.address || "Retirada na loja"}</p></section>
      <section><h2>Itens para a cozinha</h2>{order.items.map((item, index) => <article key={index}><div className="ifood-heading"><b>{item.quantity} × {item.name}</b><span>{money(item.lineTotalCents)}</span></div>{item.details && <p className="ifood-details">{item.details}</p>}</article>)}<p>Entrega: {money(order.deliveryFeeCents)}</p><p><b>Subtotal no Gestor: {money(order.subtotalCents)}</b></p><p>Descontos, taxas de serviço e cobrança permanecem no iFood. Esta importação organiza a produção; não registra venda, estoque ou recebimento no caixa.</p></section>
      <details><summary>Ver texto completo capturado (pagamento e observações)</summary><pre>{order.sourceText}</pre></details>
      {order.orderNotes && <section><h2>Observações do pedido</h2><p className="ifood-details">{order.orderNotes}</p></section>}
      {problem && <p role="alert" className="ifood-warning">{problem}</p>}
      <section><label className="ifood-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Conferi a loja de destino, os itens, adicionais e observações. O pedido foi aceito no iFood e ainda precisa ser preparado.</label><button className="ifood-submit" disabled={!confirmed || !!problem || !session?.canOperateDelivery || busy} onClick={() => void importOrder()}>{busy ? "Importando…" : "Confirmar e enviar à cozinha"}</button><p>Aceite, cancelamento e mudanças no iFood continuam no Gestor. Reimportar não atualiza nem duplica o pedido.</p></section>
    </>}
  </main>;
}
