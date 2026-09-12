"use client";

import { Minus, Plus } from "lucide-react";
import { money } from "@/lib/domain";

export type SalePayment = { method: string; amount: number; receivedAmount?: number };
export type SaleCheckout = { payments: SalePayment[]; discount: number; discountReason?: string };

const methods = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro"];
const numeric = (value: string) => Number(value.replace(",", ".")) || 0;

export function PaymentComposer({ grossTotal, discount, setDiscount, discountReason, setDiscountReason, payments, setPayments }: {
  grossTotal: number;
  discount: string;
  setDiscount: (value: string) => void;
  discountReason: string;
  setDiscountReason: (value: string) => void;
  payments: { method: string; amount: string; receivedAmount: string }[];
  setPayments: (value: { method: string; amount: string; receivedAmount: string }[]) => void;
}) {
  const discountValue = Math.min(grossTotal, Math.max(0, numeric(discount)));
  const total = Math.max(0, Math.round((grossTotal - discountValue) * 100) / 100);
  const paid = payments.length === 1 && payments[0].amount.trim() === "" ? total : payments.reduce((sum, payment) => sum + numeric(payment.amount), 0);
  const remaining = Math.round((total - paid) * 100) / 100;
  const update = (index: number, field: "method" | "amount" | "receivedAmount", value: string) => setPayments(payments.map((payment, current) => current === index ? { ...payment, [field]: value } : payment));
  const cashChange = payments.reduce((sum, payment) => payment.method === "Dinheiro" ? sum + Math.max(0, numeric(payment.receivedAmount) - numeric(payment.amount)) : sum, 0);

  return <div className="payment-composer">
    <div className="payment-discount"><label>Desconto na conta<input inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} placeholder="R$ 0,00" /></label>{discountValue > 0 && <label>Motivo do desconto<input value={discountReason} onChange={event => setDiscountReason(event.target.value)} placeholder="Obrigatório" maxLength={200} /></label>}</div>
    <div className="payment-lines">{payments.map((payment, index) => <div className="payment-line" key={index}>
      <select value={payment.method} onChange={event => update(index, "method", event.target.value)}>{methods.map(method => <option key={method}>{method}</option>)}</select>
      <input aria-label="Valor" inputMode="decimal" value={payment.amount || (payments.length === 1 ? total.toFixed(2).replace(".", ",") : "")} onChange={event => update(index, "amount", event.target.value)} placeholder="0,00" />
      {payment.method === "Dinheiro" && <input aria-label="Valor recebido" inputMode="decimal" value={payment.receivedAmount} onChange={event => update(index, "receivedAmount", event.target.value)} placeholder="Recebido" />}
      {payments.length > 1 && <button type="button" className="icon-button" aria-label="Remover forma" onClick={() => setPayments(payments.filter((_, current) => current !== index))}><Minus /></button>}
    </div>)}</div>
    <button type="button" className="secondary payment-add" onClick={() => setPayments([...payments, { method: "Pix", amount: remaining > 0 ? remaining.toFixed(2) : "", receivedAmount: "" }])}><Plus />Dividir pagamento</button>
    <div className="payment-balance"><span>Total <b>{money(total)}</b></span><span className={Math.abs(remaining) < 0.01 ? "settled" : ""}>{Math.abs(remaining) < 0.01 ? "Pagamento conferido" : remaining > 0 ? `Falta ${money(remaining)}` : `Excede ${money(-remaining)}`}</span>{cashChange > 0 && <span>Troco: <b>{money(cashChange)}</b></span>}</div>
  </div>;
}

export function serializeCheckout(payments: { method: string; amount: string; receivedAmount: string }[], discount: string, discountReason: string, grossTotal?: number): SaleCheckout {
  const discountValue = numeric(discount);
  const serialized = payments.map(payment => ({ method: payment.method, amount: numeric(payment.amount), receivedAmount: payment.method === "Dinheiro" ? numeric(payment.receivedAmount) || undefined : undefined }));
  if (serialized.length === 1 && serialized[0].amount === 0 && grossTotal !== undefined) serialized[0].amount = Math.max(0, Math.round((grossTotal - discountValue) * 100) / 100);
  return { discount: discountValue, discountReason: discountReason.trim() || undefined, payments: serialized };
}
