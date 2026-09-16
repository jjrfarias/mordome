"use client";

import { useEffect, useState } from "react";

// Seletor de motivo de cancelamento/reembolso: busca os motivos pré-definidos da categoria
// (cadastro em Configurações) e sempre entrega ao chamador uma string final de texto —
// o `label` do motivo escolhido, ou o texto digitado em "Outro". Ver ADR 0029.
// Quando não há nenhum motivo cadastrado ainda, cai direto para o campo de texto livre,
// sem travar o fluxo operacional.
export type ReasonCategory = "SALE_CANCEL" | "ITEM_CANCEL" | "REFUND";
type Reason = { id: string; label: string; active: boolean };

const OTHER_VALUE = "__other__";

export function ReasonSelect({ category, value, onChange, autoFocus, placeholder }: { category: ReasonCategory; value: string; onChange: (value: string) => void; autoFocus?: boolean; placeholder?: string }) {
  const [reasons, setReasons] = useState<Reason[] | null>(null);
  const [selection, setSelection] = useState<string>("");
  const [customText, setCustomText] = useState(value);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(async () => {
      try {
        const response = await fetch(`/api/admin/cancellation-reasons?category=${category}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error();
        setReasons((data.reasons ?? []).filter((reason: Reason) => reason.active));
      } catch { if (!controller.signal.aborted) setReasons([]); }
    });
    return () => controller.abort();
  }, [category]);

  if (reasons === null) return <label className="field"><span>Motivo</span><input disabled placeholder="Carregando motivos…" /></label>;

  if (reasons.length === 0) {
    // Sem motivos cadastrados: texto livre direto, sem forçar cadastro prévio.
    return <label className="field"><span>Motivo</span><input autoFocus={autoFocus} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder ?? "Descreva o motivo"} minLength={3} maxLength={200} /></label>;
  }

  return <>
    <label className="field"><span>Motivo</span>
      <select autoFocus={autoFocus} value={selection} onChange={event => {
        const next = event.target.value;
        setSelection(next);
        if (next === OTHER_VALUE) { onChange(customText); return; }
        if (next === "") { onChange(""); return; }
        const chosen = reasons.find(reason => reason.id === next);
        onChange(chosen?.label ?? "");
      }}>
        <option value="">Selecione um motivo…</option>
        {reasons.map(reason => <option key={reason.id} value={reason.id}>{reason.label}</option>)}
        <option value={OTHER_VALUE}>Outro (digite o motivo)</option>
      </select>
    </label>
    {selection === OTHER_VALUE && <label className="field"><span>Descreva o motivo</span><input autoFocus value={customText} onChange={event => { setCustomText(event.target.value); onChange(event.target.value); }} placeholder={placeholder ?? "Descreva o motivo"} minLength={3} maxLength={200} /></label>}
  </>;
}
