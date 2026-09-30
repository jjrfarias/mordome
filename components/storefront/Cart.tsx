"use client";

import { useId, useState } from "react";
import { ArrowRight, Bike, Info, Leaf, MapPin, Minus, Plus, ShoppingBag, Tag, Trash2, X } from "lucide-react";
import type { CartLine } from "@/lib/storefront/cart";
import { deliveryFeeLabel, type DeliveryQuote } from "@/lib/storefront/delivery";
import { formatAddressLines, formatCents, type DeliveryAddress } from "@/lib/storefront/model";
import { SafeImage, cx } from "./primitives";
import styles from "./storefront.module.css";

export function CartItem({ line, onChange }: { line: CartLine; onChange: (delta: number) => void }) {
  return <li className={styles.cartItem}>
    <SafeImage src={line.imageUrl} alt="" className={styles.cartThumb} />
    <div className={styles.cartItemInfo}>
      <b>{line.name}</b>
      {line.optionLabels.length > 0 && <small>{line.optionLabels.join(", ")}</small>}
      <small>{line.quantity}x {formatCents(line.unitPriceCents)}</small>
      <strong>{formatCents(line.unitPriceCents * line.quantity)}</strong>
    </div>
    <div className={styles.cartStepper} role="group" aria-label={`Quantidade de ${line.name}`}>
      <button type="button" onClick={() => onChange(-1)} aria-label={line.quantity === 1 ? `Remover ${line.name}` : `Diminuir ${line.name}`}>{line.quantity === 1 ? <Trash2 aria-hidden /> : <Minus aria-hidden />}</button>
      <span className={styles.stepperValue}>{line.quantity}<span className={styles.visuallyHidden}> {line.quantity === 1 ? "unidade" : "unidades"}</span></span>
      <button type="button" onClick={() => onChange(1)} aria-label={`Aumentar ${line.name}`} disabled={line.quantity >= 99}><Plus aria-hidden /></button>
    </div>
  </li>;
}

export function CouponField({ applied, error, onApply, onRemove }: { applied: { code: string; discountCents: number } | null; error: string; onApply: (code: string) => void; onRemove: () => void }) {
  const [code, setCode] = useState("");
  const inputId = useId();
  const errorId = useId();
  if (applied) return <div className={styles.couponApplied}>
    <Tag aria-hidden /><span>Cupom <b>{applied.code}</b> aplicado</span>
    <button type="button" className={styles.linkButton} onClick={onRemove}>Remover</button>
  </div>;
  return <form className={styles.coupon} onSubmit={event => { event.preventDefault(); onApply(code); }}>
    <div className={styles.couponInput}>
      <Tag aria-hidden />
      <label htmlFor={inputId} className={styles.visuallyHidden}>Cupom de desconto</label>
      <input id={inputId} value={code} onChange={event => setCode(event.target.value)} placeholder="Cupom de desconto" autoComplete="off" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />
    </div>
    <button type="submit" className={styles.secondaryButton} disabled={!code.trim()}>Aplicar</button>
    {error && <p id={errorId} className={styles.fieldError} role="alert">{error}</p>}
  </form>;
}

type Totals = { subtotalCents: number; discountCents: number; deliveryFeeCents: number | null; totalCents: number; totalIsFinal: boolean };

export function CartPanel({ lines, totals, quote, address, estimatedTime, couponsEnabled, coupon, couponError, sustainabilityNote, isDemo, showTitle = true, onChangeLine, onClear, onApplyCoupon, onRemoveCoupon, onCheckout, onEditAddress, onLoadSample }: {
  lines: CartLine[];
  totals: Totals;
  quote: DeliveryQuote;
  address: DeliveryAddress | null;
  estimatedTime: string | null;
  couponsEnabled: boolean;
  coupon: { code: string; discountCents: number } | null;
  couponError: string;
  sustainabilityNote: string | null;
  isDemo: boolean;
  showTitle?: boolean;
  onChangeLine: (lineId: string, delta: number) => void;
  onClear: () => void;
  onApplyCoupon: (code: string) => void;
  onRemoveCoupon: () => void;
  onCheckout: () => void;
  onEditAddress: () => void;
  onLoadSample?: () => void;
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const feeHelpId = useId();
  const feeLabel = deliveryFeeLabel(quote);
  const addressLines = address ? formatAddressLines(address) : null;

  return <div className={styles.cartPanel}>
    <div className={cx(styles.cartHeader, !showTitle && styles.cartHeaderCompact)}>
      {showTitle && <h2>Meu pedido</h2>}
      {lines.length > 0 && (confirmingClear
        ? <span className={styles.clearConfirm} role="group" aria-label="Confirmar limpeza do pedido">
          <span>Limpar tudo?</span>
          <button type="button" className={styles.dangerLink} onClick={() => { setConfirmingClear(false); onClear(); }}>Sim, limpar</button>
          <button type="button" className={styles.iconButtonSmall} onClick={() => setConfirmingClear(false)} aria-label="Cancelar"><X aria-hidden /></button>
        </span>
        : <button type="button" className={styles.clearButton} onClick={() => setConfirmingClear(true)}>Limpar tudo<Trash2 aria-hidden /></button>)}
    </div>

    {lines.length === 0 ? <div className={styles.cartEmpty}>
      <span className={styles.cartEmptyIcon} aria-hidden><ShoppingBag /></span>
      <b>Seu pedido está vazio</b>
      <p>Escolha pratos no cardápio e eles aparecem aqui.</p>
      {isDemo && onLoadSample && <button type="button" className={styles.secondaryButton} onClick={onLoadSample}>Carregar pedido de exemplo</button>}
    </div> : <>
      <ul className={styles.cartItems} aria-label="Itens do pedido">{lines.map(line => <CartItem key={line.lineId} line={line} onChange={delta => onChangeLine(line.lineId, delta)} />)}</ul>
      {couponsEnabled && <CouponField applied={coupon} error={couponError} onApply={onApplyCoupon} onRemove={onRemoveCoupon} />}
      <dl className={styles.totals}>
        <div><dt>Subtotal</dt><dd>{formatCents(totals.subtotalCents)}</dd></div>
        {totals.discountCents > 0 && <div className={styles.discountRow}><dt>Desconto</dt><dd>− {formatCents(totals.discountCents)}</dd></div>}
        <div>
          <dt>Taxa de entrega
            <span className={styles.infoTip} tabIndex={0} aria-describedby={feeHelpId}><Info aria-hidden /><span className={styles.visuallyHidden}>Sobre a taxa</span></span>
            <span id={feeHelpId} role="tooltip" className={styles.tooltip}>{quote.status === "confirm" ? "A equipe confirma a taxa ao aceitar o pedido." : "Calculada pela região do endereço de entrega."}</span>
          </dt>
          <dd className={cx(feeLabel !== null && styles.pendingValue)}>{feeLabel ?? formatCents(totals.deliveryFeeCents ?? 0)}</dd>
        </div>
        <div className={styles.totalRow}><dt>{totals.totalIsFinal ? "Total" : "Total sem entrega"}</dt><dd>{formatCents(totals.totalCents)}</dd></div>
      </dl>
      <button type="button" className={cx(styles.primaryButton, styles.checkoutButton)} onClick={onCheckout}>Finalizar pedido<ArrowRight aria-hidden /></button>
    </>}

    <div className={styles.deliveryBox}>
      {estimatedTime && <div className={styles.deliveryEta}>
        <span className={styles.deliveryIcon} aria-hidden><Bike /></span>
        <span><small>Entrega estimada</small><b>{estimatedTime}</b></span>
      </div>}
      <button type="button" className={styles.linkButton} onClick={onEditAddress}>{address ? "Trocar endereço" : "Informar endereço"}</button>
    </div>
    {addressLines && <div className={styles.addressCard}>
      <MapPin aria-hidden />
      <span><b>{addressLines.first}</b><small>{addressLines.second}</small></span>
    </div>}
    {quote.status === "uncovered" && <p className={styles.fieldError} role="alert">Ainda não entregamos neste bairro. Confira o endereço.</p>}

    {sustainabilityNote && <p className={styles.greenNote}><Leaf aria-hidden />{sustainabilityNote}</p>}
  </div>;
}
