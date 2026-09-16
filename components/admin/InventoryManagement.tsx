import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRightLeft, Boxes, CheckCircle2, ClipboardCheck, ClipboardList, FileText, MapPin, Plus, ShoppingCart, TrendingDown, TrendingUp, X } from "lucide-react";
import { GoodsReceiptNotes } from "./GoodsReceiptNotes";
import { PurchaseOrders } from "./PurchaseOrders";

type BaseUnit = "GRAM" | "MILLILITER" | "UNIT";
type TrackingMode = "AUTOMATIC" | "MANUAL" | "NONE";
type EstablishmentOption = { id: string; name: string };
type InventoryItem = {
  id: string;
  establishmentItemId: string | null;
  name: string;
  baseUnit: BaseUnit;
  configured: boolean;
  trackingMode: TrackingMode;
  minimumStock: number;
  allowNegative: boolean;
  balance: number;
  conversions: { name: string; symbol: string; factorToBase: number }[];
};

const unitLabels: Record<BaseUnit, string> = { GRAM: "g", MILLILITER: "ml", UNIT: "un" };

type InventorySection = "items" | "purchase-orders" | "goods-receipts" | "count";

export function InventoryManagement({ establishmentId, establishmentName }: { establishmentId: string; establishmentName: string }) {
  const [section, setSection] = useState<InventorySection>("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [establishments, setEstablishments] = useState<EstablishmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [baseUnit, setBaseUnit] = useState<BaseUnit>("GRAM");
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("AUTOMATIC");
  const [minimumStock, setMinimumStock] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/inventory", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o estoque.");
      setItems(data.items);
      setEstablishments(data.establishments ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o estoque.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void establishmentId;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [establishmentId, load]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minimum = Number(minimumStock.replace(",", "."));
    if (name.trim().length < 2 || !Number.isFinite(minimum) || minimum < 0) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CREATE_ITEM", name: name.trim(), baseUnit, trackingMode, minimumStock: minimum, allowNegative: true }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível cadastrar o item.");
      setName(""); setMinimumStock("0"); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o item.");
    } finally { setSaving(false); }
  };

  return <div className="inventory-admin">
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Controle por unidade</span><h2>Estoque</h2><span className="active-unit-label"><MapPin />{establishmentName}</span></div>
        <div className="settings-summary"><span><i /> Itens ativos</span><strong>{items.filter(item => item.configured).length}</strong></div>
      </div>
      <nav className="settings-tabs" aria-label="Seções do estoque">
        <button className={section === "items" ? "active" : ""} onClick={() => setSection("items")}>Itens de estoque</button>
        <button className={section === "purchase-orders" ? "active" : ""} onClick={() => setSection("purchase-orders")}><ShoppingCart size={14} />Ordens de compra</button>
        <button className={section === "goods-receipts" ? "active" : ""} onClick={() => setSection("goods-receipts")}><FileText size={14} />Notas de entrada</button>
        <button className={section === "count" ? "active" : ""} onClick={() => setSection("count")}><ClipboardList size={14} />Contagem de estoque</button>
      </nav>
      {section === "items" && <form className="inventory-create-form" onSubmit={create}>
        <label className="field"><span>Item</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Milho" /></label>
        <label className="field"><span>Unidade-base</span><select value={baseUnit} onChange={event => setBaseUnit(event.target.value as BaseUnit)}><option value="GRAM">Grama (g)</option><option value="MILLILITER">Mililitro (ml)</option><option value="UNIT">Unidade (un)</option></select></label>
        <label className="field"><span>Controle</span><select value={trackingMode} onChange={event => setTrackingMode(event.target.value as TrackingMode)}><option value="AUTOMATIC">Automático por venda</option><option value="MANUAL">Somente baixa manual</option><option value="NONE">Sem controle</option></select></label>
        <label className="field"><span>Estoque mínimo</span><input inputMode="decimal" value={minimumStock} onChange={event => setMinimumStock(event.target.value)} /></label>
        <button className="primary" disabled={saving || name.trim().length < 2}><Plus />Cadastrar item</button>
      </form>}
    </section>
    {section === "items" && <>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {loading && <div className="empty"><span>Carregando estoque…</span></div>}
      {!loading && items.length === 0 && <div className="big-empty"><Boxes /><h2>Estoque vazio nesta unidade</h2><p>Cadastre os insumos usados por {establishmentName}.</p></div>}
      {!loading && items.length > 0 && <section className="inventory-list">{items.map(item => <InventoryRow key={item.id} item={item} establishments={establishments} onChanged={load} />)}</section>}
    </>}
    {section === "purchase-orders" && <PurchaseOrders items={items} />}
    {section === "goods-receipts" && <GoodsReceiptNotes items={items} />}
    {section === "count" && <StockCountSession items={items.filter(item => item.configured)} loading={loading} error={error} establishmentName={establishmentName} onApplied={load} />}
  </div>;
}

function StockCountSession({ items, loading, error, establishmentName, onApplied }: { items: InventoryItem[]; loading: boolean; error: string; establishmentName: string; onApplied: () => Promise<void> }) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");

  const rows = useMemo(() => items.map(item => {
    const raw = counts[item.id];
    const numeric = raw !== undefined && raw.trim() !== "" ? Number(raw.replace(",", ".")) : null;
    const hasCount = numeric !== null && Number.isFinite(numeric);
    const delta = hasCount ? Math.round((numeric! - item.balance) * 1000) / 1000 : 0;
    return { item, hasCount, numeric, delta };
  }), [items, counts]);

  const filledCount = rows.filter(row => row.hasCount).length;
  const changedRows = rows.filter(row => row.hasCount && row.delta !== 0);

  const setCount = (itemId: string, value: string) => {
    setSuccess("");
    setCounts(current => ({ ...current, [itemId]: value }));
  };

  const resetSession = () => { setCounts({}); setReason(""); };

  const confirm = async () => {
    setSaving(true); setSaveError("");
    try {
      const payload = {
        action: "BULK_PHYSICAL_COUNT",
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
        items: changedRows.map(row => ({ establishmentItemId: row.item.establishmentItemId as string, countedQuantity: row.numeric as number, factorToBase: row.item.conversions[0]?.factorToBase ?? 1 })),
      };
      const response = await fetch("/api/admin/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível aplicar a contagem.");
      setConfirming(false);
      resetSession();
      setSuccess(`Contagem aplicada: ${changedRows.length} ${changedRows.length === 1 ? "item ajustado" : "itens ajustados"}.`);
      await onApplied();
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Não foi possível aplicar a contagem.");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="empty"><span>Carregando estoque…</span></div>;
  if (error) return <div className="auth-error" role="alert">{error}</div>;
  if (items.length === 0) return <div className="big-empty"><ClipboardList /><h2>Nenhum item configurado</h2><p>Ative itens de estoque em {establishmentName} para iniciar uma contagem.</p></div>;

  return <section className="stock-count-session">
    <div className="stock-count-summary">
      <div><span>Itens na unidade</span><strong>{items.length}</strong></div>
      <div><span>Contagens preenchidas</span><strong>{filledCount}</strong></div>
      <div><span>Com diferença</span><strong>{changedRows.length}</strong></div>
      <button className="primary" disabled={changedRows.length === 0} onClick={() => setConfirming(true)}><ClipboardCheck />Confirmar contagem</button>
    </div>
    {success && <div className="stock-count-success"><CheckCircle2 />{success}</div>}
    {saveError && <div className="auth-error" role="alert">{saveError}</div>}
    <div className="stock-count-list">
      {rows.map(({ item, hasCount, delta }) => {
        const unit = unitLabels[item.baseUnit];
        return <article key={item.id} className={`stock-count-row ${hasCount && delta !== 0 ? (delta > 0 ? "surplus" : "shortage") : ""}`}>
          <div className="inventory-identity"><small>Saldo do sistema</small><strong>{item.name}</strong></div>
          <div className="stock-count-balance"><strong>{item.balance.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</strong><em>{unit}</em></div>
          <label className="field"><span>Contagem física</span><input inputMode="decimal" placeholder="Não contado" value={counts[item.id] ?? ""} onChange={event => setCount(item.id, event.target.value)} /></label>
          <div className="stock-count-delta">
            {hasCount && delta === 0 && <span className="neutral">Sem diferença</span>}
            {hasCount && delta > 0 && <span className="surplus"><TrendingUp size={13} />+{delta.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {unit}</span>}
            {hasCount && delta < 0 && <span className="shortage"><TrendingDown size={13} />{delta.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {unit}</span>}
          </div>
        </article>;
      })}
    </div>
    {confirming && <div className="modal-bg" role="dialog" aria-modal="true">
      <div className="modal">
        <button className="modal-close" onClick={() => setConfirming(false)} aria-label="Fechar"><X /></button>
        <div className="modal-icon"><ClipboardCheck /></div>
        <h2>Confirmar contagem de estoque</h2>
        <p>{changedRows.length} {changedRows.length === 1 ? "item será ajustado" : "itens serão ajustados"} em {establishmentName}:</p>
        <ul className="stock-count-preview">
          {changedRows.map(row => <li key={row.item.id}><span>{row.item.name}</span><strong className={row.delta > 0 ? "surplus" : "shortage"}>{row.delta > 0 ? "+" : ""}{row.delta.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {unitLabels[row.item.baseUnit]}</strong></li>)}
        </ul>
        <label className="field"><span>Motivo da contagem</span><input autoFocus value={reason} onChange={event => setReason(event.target.value)} placeholder="Ex.: Contagem mensal de 16/09" /></label>
        {saveError && <span className="inline-error">{saveError}</span>}
        <button className="primary wide" disabled={saving || reason.trim().length < 3} onClick={() => void confirm()}>{saving ? "Aplicando…" : "Aplicar ajustes"}</button>
      </div>
    </div>}
  </section>;
}

function InventoryRow({ item, establishments, onChanged }: { item: InventoryItem; establishments: EstablishmentOption[]; onChanged: () => Promise<void> }) {
  const [operation, setOperation] = useState<"entry" | "transfer" | "adjust" | null>(null);
  const [adjustmentKind, setAdjustmentKind] = useState<"LOSS" | "INTERNAL_CONSUMPTION" | "PHYSICAL_COUNT">("LOSS");
  const [quantity, setQuantity] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [conversion, setConversion] = useState(item.conversions[0]?.factorToBase ?? 1);
  const [destinationEstablishmentId, setDestinationEstablishmentId] = useState(establishments[0]?.id ?? "");
  const [reason, setReason] = useState("Transferência entre unidades");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const unit = unitLabels[item.baseUnit];
  const low = item.configured && item.minimumStock > 0 && item.balance <= item.minimumStock;

  const configure = async () => {
    setSaving(true);
    await fetch("/api/admin/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CONFIGURE_ITEM", inventoryItemId: item.id }) });
    setSaving(false); await onChanged();
  };

  const submitOperation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numeric = Number(quantity.replace(",", "."));
    const cost = totalCost ? Number(totalCost.replace(",", ".")) : undefined;
    if (!item.establishmentItemId || !operation || !Number.isFinite(numeric) || numeric <= 0) return;
    if (operation === "entry" && cost !== undefined && (!Number.isFinite(cost) || cost < 0)) return;
    if (operation === "transfer" && (!destinationEstablishmentId || reason.trim().length < 2)) return;
    if (operation === "adjust" && reason.trim().length < 3) return;
    setSaving(true); setError("");
    const payload = operation === "entry"
      ? { action: "ENTRY", establishmentItemId: item.establishmentItemId, quantity: numeric, factorToBase: conversion, totalCost: cost, idempotencyKey: crypto.randomUUID(), reason: "Entrada manual" }
      : operation === "transfer" ? { action: "TRANSFER", establishmentItemId: item.establishmentItemId, destinationEstablishmentId, quantity: numeric, factorToBase: conversion, idempotencyKey: crypto.randomUUID(), reason: reason.trim() }
      : { action: "ADJUST", establishmentItemId: item.establishmentItemId, kind: adjustmentKind, quantity: numeric, factorToBase: conversion, idempotencyKey: crypto.randomUUID(), reason: reason.trim() };
    const response = await fetch("/api/admin/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (response.ok) { setQuantity(""); setTotalCost(""); setOperation(null); await onChanged(); }
    else setError(data.error ?? "Não foi possível concluir a movimentação.");
  };

  return <article className={`inventory-row ${low ? "low" : ""}`}>
    <div className="inventory-icon"><Boxes /></div>
    <div className="inventory-identity"><small>{item.trackingMode === "AUTOMATIC" ? "Consumo automático" : item.trackingMode === "MANUAL" ? "Baixa manual" : "Sem controle"}</small><strong>{item.name}</strong></div>
    <div className="inventory-balance"><small>Saldo nesta unidade</small><strong>{item.balance.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} <em>{unit}</em></strong>{low && <span>Estoque baixo</span>}</div>
    {!item.configured
      ? <button className="secondary" disabled={saving} onClick={() => void configure()}>Ativar nesta unidade</button>
      : item.trackingMode !== "NONE" && <div className="inventory-actions"><button className="secondary" onClick={() => setOperation(current => current === "entry" ? null : "entry")}><ArrowDownToLine />Dar entrada</button><button className="secondary" disabled={establishments.length === 0 || item.balance <= 0} onClick={() => setOperation(current => current === "transfer" ? null : "transfer")}><ArrowRightLeft />Transferir</button><button className="secondary" onClick={() => { setReason(""); setOperation(current => current === "adjust" ? null : "adjust"); }}><ClipboardCheck />Ajustar</button></div>}
    {operation && <form className={`stock-entry-form ${operation === "transfer" ? "transfer-form" : ""}`} onSubmit={submitOperation}>
      {operation === "transfer" && <label className="field"><span>Unidade de destino</span><select value={destinationEstablishmentId} onChange={event => setDestinationEstablishmentId(event.target.value)}>{establishments.map(establishment => <option key={establishment.id} value={establishment.id}>{establishment.name}</option>)}</select></label>}
      {operation === "adjust" && <label className="field"><span>Tipo do ajuste</span><select value={adjustmentKind} onChange={event => setAdjustmentKind(event.target.value as typeof adjustmentKind)}><option value="LOSS">Perda / descarte</option><option value="INTERNAL_CONSUMPTION">Consumo interno</option><option value="PHYSICAL_COUNT">Contagem física</option></select></label>}
      <label className="field"><span>Quantidade</span><input autoFocus inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="0" /></label>
      <label className="field"><span>Unidade</span><select value={conversion} onChange={event => setConversion(Number(event.target.value))}>{item.conversions.map(option => <option key={option.name} value={option.factorToBase}>{option.name} ({option.symbol})</option>)}</select></label>
      {operation === "entry" && <label className="field"><span>Custo total (opcional)</span><input inputMode="decimal" value={totalCost} onChange={event => setTotalCost(event.target.value)} placeholder="R$ 0,00" /></label>}
      {(operation === "transfer" || operation === "adjust") && <label className="field"><span>Motivo</span><input value={reason} onChange={event => setReason(event.target.value)} placeholder={operation === "adjust" ? "Obrigatório para auditoria" : undefined} /></label>}
      <button className="primary" disabled={saving}>{operation === "entry" ? "Confirmar entrada" : operation === "transfer" ? "Confirmar transferência" : adjustmentKind === "PHYSICAL_COUNT" ? "Confirmar contagem" : "Confirmar ajuste"}</button>
      {error && <span className="inline-error">{error}</span>}
    </form>}
  </article>;
}
