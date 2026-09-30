"use client";

import { useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { formatPostalCode, quoteDelivery, usesAutomaticCoverage } from "@/lib/storefront/delivery";
import { formatCents, type DeliveryAddress, type DeliveryAreaInfo } from "@/lib/storefront/model";
import { Dialog, cx } from "./primitives";
import styles from "./storefront.module.css";

const blank: DeliveryAddress = { postalCode: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "", latitude: null, longitude: null, areaId: null };

export function DeliveryAddressDialog({ open, initial, areas, onClose, onSave }: { open: boolean; initial: DeliveryAddress | null; areas: DeliveryAreaInfo[]; onClose: () => void; onSave: (address: DeliveryAddress) => void }) {
  return <Dialog open={open} onClose={onClose} title="Endereço de entrega" description="Usamos o endereço para calcular a taxa e entregar o pedido." size="md">
    {open && <AddressForm initial={initial ?? blank} areas={areas} onCancel={onClose} onSave={onSave} />}
  </Dialog>;
}

function AddressForm({ initial, areas, onCancel, onSave }: { initial: DeliveryAddress; areas: DeliveryAreaInfo[]; onCancel: () => void; onSave: (address: DeliveryAddress) => void }) {
  const [address, setAddress] = useState<DeliveryAddress>(initial);
  const [lookup, setLookup] = useState<{ state: "idle" | "loading" | "error"; message?: string }>({ state: "idle" });
  const [submitted, setSubmitted] = useState(false);
  const lookupId = useRef(0);
  const automatic = usesAutomaticCoverage(areas);
  const quote = quoteDelivery(areas, address);
  const set = (patch: Partial<DeliveryAddress>) => setAddress(current => ({ ...current, ...patch }));

  const changePostalCode = async (raw: string) => {
    const postalCode = formatPostalCode(raw);
    const digits = postalCode.replace(/\D/g, "");
    const requestId = ++lookupId.current;
    set({ postalCode, latitude: null, longitude: null });
    setLookup({ state: "idle" });
    if (digits.length !== 8) return;
    setLookup({ state: "loading" });
    try {
      const response = await fetch(`/api/public/postal-code/${digits}`);
      const result = await response.json().catch(() => ({}));
      if (requestId !== lookupId.current) return;
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Não foi possível consultar o CEP.");
      set({ street: result.street ?? "", neighborhood: result.neighborhood ?? "", city: result.city ?? "", state: result.state ?? "", latitude: typeof result.latitude === "number" ? result.latitude : null, longitude: typeof result.longitude === "number" ? result.longitude : null });
      setLookup({ state: "idle" });
    } catch (cause) {
      if (requestId === lookupId.current) setLookup({ state: "error", message: `${cause instanceof Error ? cause.message : "Não foi possível consultar o CEP."} Preencha o endereço manualmente.` });
    }
  };

  const missing = {
    postalCode: address.postalCode.replace(/\D/g, "").length !== 8,
    street: !address.street.trim(),
    number: !address.number.trim(),
    neighborhood: !address.neighborhood.trim(),
    area: areas.length > 0 && !automatic && !address.areaId,
  };
  const valid = !Object.values(missing).some(Boolean) && quote.status !== "uncovered";
  const invalid = (key: keyof typeof missing) => submitted && missing[key];

  return <form className={styles.form} noValidate onSubmit={event => { event.preventDefault(); setSubmitted(true); if (valid) onSave({ ...address, street: address.street.trim(), number: address.number.trim(), complement: address.complement.trim(), neighborhood: address.neighborhood.trim() }); }}>
    <div className={styles.formGrid}>
      <label className={cx(styles.field, styles.fieldShort)}>
        <span>CEP</span>
        <input value={address.postalCode} onChange={event => void changePostalCode(event.target.value)} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" maxLength={9} aria-invalid={invalid("postalCode")} required />
        {lookup.state === "loading" && <small className={styles.fieldHint}><LoaderCircle aria-hidden className={styles.spin} />Buscando endereço…</small>}
      </label>
      <label className={cx(styles.field, styles.fieldWide)}>
        <span>Rua</span>
        <input value={address.street} onChange={event => set({ street: event.target.value })} autoComplete="address-line1" maxLength={120} aria-invalid={invalid("street")} required />
      </label>
      <label className={cx(styles.field, styles.fieldShort)}>
        <span>Número</span>
        <input value={address.number} onChange={event => set({ number: event.target.value })} inputMode="numeric" maxLength={12} aria-invalid={invalid("number")} required />
      </label>
      <label className={cx(styles.field, styles.fieldWide)}>
        <span>Complemento <small>(opcional)</small></span>
        <input value={address.complement} onChange={event => set({ complement: event.target.value })} autoComplete="address-line2" maxLength={60} placeholder="Apto, bloco, referência" />
      </label>
      <label className={styles.field}>
        <span>Bairro</span>
        <input value={address.neighborhood} onChange={event => set({ neighborhood: event.target.value })} maxLength={100} aria-invalid={invalid("neighborhood")} required />
      </label>
      <label className={styles.field}>
        <span>Cidade/UF</span>
        <input value={address.city ? `${address.city}${address.state ? `/${address.state}` : ""}` : ""} readOnly placeholder="Preenchido pelo CEP" tabIndex={-1} />
      </label>
    </div>
    {lookup.state === "error" && <p className={styles.fieldError} role="alert">{lookup.message}</p>}
    {areas.length > 0 && !automatic && <label className={styles.field}>
      <span>Região de entrega</span>
      <select value={address.areaId ?? ""} onChange={event => set({ areaId: event.target.value || null })} aria-invalid={invalid("area")} required>
        <option value="">Selecione sua região</option>
        {areas.map(area => <option key={area.id} value={area.id}>{area.name} · {formatCents(area.feeCents)}</option>)}
      </select>
    </label>}
    {quote.status === "known" && <p className={styles.formSuccess}>Entregamos em <b>{quote.area.name}</b> · taxa de {formatCents(quote.feeCents)}</p>}
    {quote.status === "uncovered" && <p className={styles.fieldError} role="alert">Ainda não entregamos no bairro {address.neighborhood}.</p>}
    {quote.status === "confirm" && <p className={styles.formNote}>A taxa de entrega será confirmada pela equipe ao aceitar o pedido.</p>}
    {submitted && !valid && quote.status !== "uncovered" && <p className={styles.fieldError} role="alert">Preencha CEP, rua, número, bairro{missing.area ? " e a região" : ""}.</p>}
    <div className={styles.formActions}>
      <button type="button" className={styles.ghostButton} onClick={onCancel}>Cancelar</button>
      <button type="submit" className={styles.primaryButton}>Salvar endereço</button>
    </div>
  </form>;
}
