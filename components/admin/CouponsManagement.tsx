import { useEffect, useState } from "react";
import { money } from "@/lib/domain";

// Cadastro de cupons de desconto (ver ADR 0041). Escopo por organização — valem para toda a rede,
// mesmo padrão de `CancellationReasonsManagement`. Reaproveita `catalog.manage` como permissão.
type DiscountType = "PERCENT" | "FIXED";
type Coupon = { id: string; code: string; discountType: DiscountType; discountValue: number; validFrom: string | null; validUntil: string | null; maxUses: number | null; usesCount: number; active: boolean };

const discountTypeLabels: Record<DiscountType, string> = { PERCENT: "Percentual", FIXED: "Valor fixo (R$)" };
const formatDiscount = (coupon: Coupon) => coupon.discountType === "PERCENT" ? `${coupon.discountValue}%` : money(coupon.discountValue);
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "Sem validade";
const toIsoOrNull = (value: string) => value ? new Date(value).toISOString() : null;

export function CouponsManagement() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("PERCENT");
  const [discountValue, setDiscountValue] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/coupons", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os cupons.");
      setCoupons((data.coupons ?? []).map((coupon: Coupon) => ({ ...coupon, discountValue: Number(coupon.discountValue) })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os cupons."); } finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(discountValue.replace(",", "."));
    if (code.trim().length < 3 || !Number.isFinite(value) || value <= 0 || creating) return;
    setCreating(true); setError("");
    try {
      const response = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim(), discountType, discountValue: value, validFrom: toIsoOrNull(validFrom), validUntil: toIsoOrNull(validUntil), maxUses: maxUses ? Number(maxUses) : null }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o cupom.");
      setCode(""); setDiscountValue(""); setValidFrom(""); setValidUntil(""); setMaxUses("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o cupom."); } finally { setCreating(false); }
  };

  const toggleActive = async (coupon: Coupon) => {
    setError("");
    try {
      const response = await fetch("/api/admin/coupons", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ couponId: coupon.id, active: !coupon.active }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o cupom.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o cupom."); }
  };

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Cupons de desconto</span><h2>Novo cupom</h2></div></div>
      <p className="section-note">Cadastre um código que o operador pode digitar no PDV para aplicar automaticamente o desconto configurado aqui. Sem validade e sem limite de usos são opcionais — deixe em branco para &quot;nunca expira&quot;/&quot;uso ilimitado&quot;.</p>
      <form onSubmit={create} className="settings-form">
        <label className="field"><span>Código</span><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="Ex.: BEMVINDO10" maxLength={40} /></label>
        <label className="field"><span>Tipo de desconto</span>
          <select value={discountType} onChange={event => setDiscountType(event.target.value as DiscountType)}>
            <option value="PERCENT">Percentual (%)</option>
            <option value="FIXED">Valor fixo (R$)</option>
          </select>
        </label>
        <label className="field"><span>Valor</span><input inputMode="decimal" value={discountValue} onChange={event => setDiscountValue(event.target.value)} placeholder={discountType === "PERCENT" ? "Ex.: 10" : "Ex.: 15,00"} /></label>
        <label className="field"><span>Válido a partir de (opcional)</span><input type="date" value={validFrom} onChange={event => setValidFrom(event.target.value)} /></label>
        <label className="field"><span>Válido até (opcional)</span><input type="date" value={validUntil} onChange={event => setValidUntil(event.target.value)} /></label>
        <label className="field"><span>Limite de usos (opcional)</span><input inputMode="numeric" value={maxUses} onChange={event => setMaxUses(event.target.value)} placeholder="Ilimitado" /></label>
        <button className="primary" type="submit" disabled={code.trim().length < 3 || creating}>{creating ? "Criando…" : "Criar cupom"}</button>
      </form>
    </section>
    {loading ? <div className="empty"><span>Carregando cupons…</span></div> : null}
    {error && <div className="auth-error">{error}</div>}
    {!loading && coupons.length === 0 && <div className="empty small"><span>Nenhum cupom cadastrado ainda.</span></div>}
    {!loading && coupons.length > 0 && <section className="panel settings-shell">
      <div className="role-list">
        {coupons.map(coupon => <article key={coupon.id} className="role-card">
          <div className="role-card-head">
            <div>
              <b>{coupon.code}</b>
              <span className="status-pill status-inactive">{discountTypeLabels[coupon.discountType]}: {formatDiscount(coupon)}</span>
              <span className="status-pill status-inactive">{formatDate(coupon.validFrom)} até {formatDate(coupon.validUntil)}</span>
              <span className="status-pill status-inactive">Usos: {coupon.usesCount}{coupon.maxUses !== null ? ` / ${coupon.maxUses}` : ""}</span>
              {!coupon.active && <span className="status-pill status-inactive">Inativo</span>}
            </div>
            <button type="button" className={`secondary ${coupon.active ? "warn" : ""}`} onClick={() => toggleActive(coupon)}>{coupon.active ? "Desativar" : "Ativar"}</button>
          </div>
        </article>)}
      </div>
    </section>}
  </section>;
}
