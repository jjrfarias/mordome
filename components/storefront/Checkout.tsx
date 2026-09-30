"use client";

import { useState } from "react";
import { CircleCheck, LoaderCircle, MapPin, Store, Truck } from "lucide-react";
import type { CartLine } from "@/lib/storefront/cart";
import { addressIsComplete, deliveryFeeLabel, type DeliveryQuote } from "@/lib/storefront/delivery";
import { formatAddressLines, formatCents, type DeliveryAddress } from "@/lib/storefront/model";
import { Dialog, cx } from "./primitives";
import styles from "./storefront.module.css";

export type CheckoutForm = { name: string; phone: string; fulfillment: "delivery" | "pickup"; notes: string; paymentMethod: string | null };
export type CheckoutResult = { kind: "live"; orderId: string; feeToConfirm: boolean } | { kind: "demo" };

type Totals = { subtotalCents: number; discountCents: number; deliveryFeeCents: number | null; totalCents: number; totalIsFinal: boolean };

const phoneDigits = (value: string) => value.replace(/\D/g, "");

function formatPhone(value: string) {
  const digits = phoneDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function Checkout({ open, isDemo, lines, totals, pickupTotals, quote, address, pickupSupported, paymentMethods, establishmentName, onClose, onEditAddress, onSubmit, onFinished }: {
  open: boolean;
  isDemo: boolean;
  lines: CartLine[];
  totals: Totals;
  pickupTotals: Totals;
  quote: DeliveryQuote;
  address: DeliveryAddress | null;
  pickupSupported: boolean;
  paymentMethods: string[] | null;
  establishmentName: string;
  onClose: () => void;
  onEditAddress: () => void;
  onSubmit: (form: CheckoutForm) => Promise<CheckoutResult>;
  onFinished: () => void;
}) {
  const [form, setForm] = useState<CheckoutForm>({ name: "", phone: "", fulfillment: "delivery", notes: "", paymentMethod: null });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckoutResult | null>(null);

  const close = () => {
    if (sending) return;
    if (result) { setResult(null); setSubmitted(false); setForm(current => ({ ...current, notes: "" })); onFinished(); }
    setError("");
    onClose();
  };

  const delivery = form.fulfillment === "delivery";
  const shownTotals = delivery ? totals : pickupTotals;
  const problems = {
    name: form.name.trim().length < 2,
    phone: phoneDigits(form.phone).length < 10,
    address: delivery && !addressIsComplete(address),
    area: delivery && (quote.status === "uncovered" || quote.status === "pending"),
    payment: paymentMethods !== null && !form.paymentMethod,
  };
  const valid = lines.length > 0 && !Object.values(problems).some(Boolean);
  const show = (key: keyof typeof problems) => submitted && problems[key];
  const addressLines = address ? formatAddressLines(address) : null;
  const feeLabel = deliveryFeeLabel(quote);

  const submit = async () => {
    setSubmitted(true);
    setError("");
    if (!valid || sending) return;
    setSending(true);
    try {
      setResult(await onSubmit({ ...form, name: form.name.trim(), notes: form.notes.trim() }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar o pedido.");
    } finally {
      setSending(false);
    }
  };

  if (result) return <Dialog open={open} onClose={close} title={result.kind === "demo" ? "Demonstração concluída" : "Pedido recebido!"} size="sm" footer={<button type="button" className={styles.primaryButton} onClick={close}>Voltar ao cardápio</button>}>
    <div className={styles.success}>
      <CircleCheck aria-hidden />
      {result.kind === "demo"
        ? <p>Este foi um pedido de demonstração. <b>Nenhum pedido foi enviado ao estabelecimento e nada foi cobrado.</b></p>
        : <p>{establishmentName} recebeu seu pedido <b>nº {result.orderId.slice(-6).toUpperCase()}</b>. A equipe vai confirmar o pedido{result.feeToConfirm ? " e a taxa de entrega" : ""} pelo telefone informado.</p>}
    </div>
  </Dialog>;

  return <Dialog open={open} onClose={close} title="Finalizar pedido" description={isDemo ? "Ambiente de demonstração — nenhum pedido real é enviado." : establishmentName} size="lg" variant="sheet"
    footer={<>
      <div className={styles.checkoutTotal}><small>{shownTotals.totalIsFinal ? "Total" : "Total sem entrega"}</small><b>{formatCents(shownTotals.totalCents)}</b></div>
      <button type="button" className={cx(styles.primaryButton, styles.grow)} onClick={() => void submit()} disabled={sending || lines.length === 0} aria-busy={sending}>
        {sending ? <><LoaderCircle aria-hidden className={styles.spin} />Enviando…</> : isDemo ? "Concluir demonstração" : "Enviar pedido"}
      </button>
    </>}>
    <form className={styles.checkout} noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
      <section className={styles.checkoutStep} aria-labelledby="checkout-identificacao">
        <h3 id="checkout-identificacao"><span aria-hidden>1</span>Identificação</h3>
        <div className={styles.formGrid}>
          <label className={styles.field}><span>Nome</span>
            <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} autoComplete="name" maxLength={100} aria-invalid={show("name")} required />
            {show("name") && <small className={styles.fieldError}>Informe seu nome.</small>}
          </label>
          <label className={styles.field}><span>Telefone (WhatsApp)</span>
            <input value={form.phone} onChange={event => setForm({ ...form, phone: formatPhone(event.target.value) })} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(00) 00000-0000" aria-invalid={show("phone")} required />
            {show("phone") && <small className={styles.fieldError}>Informe um telefone com DDD.</small>}
          </label>
        </div>
        <p className={styles.formNote}>Usamos nome e telefone somente para preparar, entregar e confirmar este pedido.</p>
      </section>

      <section className={styles.checkoutStep} aria-labelledby="checkout-entrega">
        <h3 id="checkout-entrega"><span aria-hidden>2</span>{pickupSupported ? "Entrega ou retirada" : "Entrega"}</h3>
        {pickupSupported && <div className={styles.segmented} role="radiogroup" aria-label="Como receber">
          <label className={cx(delivery && styles.segmentedActive)}><input type="radio" name="recebimento" checked={delivery} onChange={() => setForm({ ...form, fulfillment: "delivery" })} /><Truck aria-hidden />Entrega</label>
          <label className={cx(!delivery && styles.segmentedActive)}><input type="radio" name="recebimento" checked={!delivery} onChange={() => setForm({ ...form, fulfillment: "pickup" })} /><Store aria-hidden />Retirada</label>
        </div>}
        {delivery ? <div className={cx(styles.addressCard, styles.addressCardAction, (show("address") || show("area")) && styles.addressCardError)}>
          <MapPin aria-hidden />
          <span>{addressLines ? <><b>{addressLines.first}</b><small>{addressLines.second}</small></> : <b>Nenhum endereço informado</b>}
            <small>Taxa de entrega: {feeLabel ?? formatCents(quote.status === "known" ? quote.feeCents : 0)}</small></span>
          <button type="button" className={styles.linkButton} onClick={onEditAddress}>{address ? "Trocar" : "Informar"}</button>
        </div> : <p className={styles.formNote}>Retire no balcão de {establishmentName}. Avisamos quando estiver pronto.</p>}
        {show("address") && <p className={styles.fieldError} role="alert">Informe o endereço de entrega.</p>}
        {!problems.address && show("area") && <p className={styles.fieldError} role="alert">{quote.status === "uncovered" ? "Ainda não entregamos neste endereço." : "Escolha a região de entrega no endereço."}</p>}
        <label className={styles.field}><span>Observações <small>(opcional)</small></span>
          <textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} maxLength={300} rows={2} placeholder="Ex.: sem cebola, interfone quebrado" />
        </label>
      </section>

      <section className={styles.checkoutStep} aria-labelledby="checkout-pagamento">
        <h3 id="checkout-pagamento"><span aria-hidden>3</span>Pagamento</h3>
        {paymentMethods ? <>
          <div className={styles.paymentOptions} role="radiogroup" aria-label="Forma de pagamento">
            {paymentMethods.map(method => <label key={method} className={cx(styles.choice, styles.choiceBox, form.paymentMethod === method && styles.choiceBoxActive)}>
              <input type="radio" name="pagamento" checked={form.paymentMethod === method} onChange={() => setForm({ ...form, paymentMethod: method })} />{method}
            </label>)}
          </div>
          {show("payment") && <p className={styles.fieldError} role="alert">Escolha a forma de pagamento.</p>}
          {isDemo && <p className={styles.formNote}>Demonstração: nenhum dado de cartão é solicitado ou armazenado.</p>}
        </> : <p className={styles.formNote}>O pagamento é combinado com o estabelecimento na confirmação do pedido. Nenhum pagamento é feito por esta página.</p>}
      </section>

      <section className={styles.checkoutStep} aria-labelledby="checkout-revisao">
        <h3 id="checkout-revisao"><span aria-hidden>4</span>Revisão</h3>
        <ul className={styles.reviewList}>
          {lines.map(line => <li key={line.lineId}><span>{line.quantity}x {line.name}{line.optionLabels.length > 0 && <small>{line.optionLabels.join(", ")}</small>}</span><b>{formatCents(line.unitPriceCents * line.quantity)}</b></li>)}
        </ul>
        <dl className={styles.totals}>
          <div><dt>Subtotal</dt><dd>{formatCents(shownTotals.subtotalCents)}</dd></div>
          {shownTotals.discountCents > 0 && <div className={styles.discountRow}><dt>Desconto</dt><dd>− {formatCents(shownTotals.discountCents)}</dd></div>}
          {delivery && <div><dt>Taxa de entrega</dt><dd className={cx(feeLabel !== null && styles.pendingValue)}>{feeLabel ?? formatCents(shownTotals.deliveryFeeCents ?? 0)}</dd></div>}
          <div className={styles.totalRow}><dt>{shownTotals.totalIsFinal ? "Total" : "Total sem entrega"}</dt><dd>{formatCents(shownTotals.totalCents)}</dd></div>
        </dl>
        {!isDemo && <p className={styles.formNote}>Preços e taxa são conferidos pelo estabelecimento ao registrar o pedido.</p>}
      </section>
      {error && <p className={styles.formError} role="alert">{error}</p>}
    </form>
  </Dialog>;
}
