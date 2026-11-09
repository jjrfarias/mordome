"use client";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { money, type IngredientGroup, type SelectedIngredientOption } from "@/lib/domain";
import { IngredientPicker, type IngredientPickerProduct } from "./IngredientPicker";
type Product = { id: string; name: string; price: number; ingredientGroups?: IngredientGroup[] };
type Item = { id: string; productId: string | null; productName: string; quantity: number; selectedOptionsSnapshot?: SelectedIngredientOption[] | null };
export function DeliveryAddition({ order, products, onClose, onSaved }: { order: { id: string; customerName: string; items: Item[] }; products: Product[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [mode, setMode] = useState<"EXTRAS" | "PRODUCT">("EXTRAS");
  const [selected, setSelected] = useState(""); const [quantity, setQuantity] = useState(1);
  const [picker, setPicker] = useState<IngredientPickerProduct | null>(null);
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const attempt = useRef({ body: "", key: "" });
  const item = order.items.find(item => item.id === selected);
  const product = products.find(product => product.id === (mode === "EXTRAS" ? item?.productId : selected));
  const prepare = () => {
    if (!product) { setError("Selecione um item disponível."); return; }
    const groups = mode === "PRODUCT" ? product.ingredientGroups : (product.ingredientGroups ?? []).filter(group => group.minSelections === 0).map(group => ({ ...group, maxSelections: Math.max(0, group.maxSelections - (item?.selectedOptionsSnapshot ?? []).filter(option => option.groupName === group.name).length), options: group.options.filter(option => !(item?.selectedOptionsSnapshot ?? []).some(old => old.groupName === group.name && old.optionName === option.name)) })).filter(group => group.maxSelections > 0 && group.options.length > 0);
    if (mode === "EXTRAS" && !groups?.length) { setError("Este item não possui novos adicionais disponíveis no cadastro."); return; }
    setError(""); setPicker({ ...product, name: mode === "EXTRAS" ? `Adicionais para ${item?.productName} (${quantity} un.)` : `${product.name} (${quantity} un.)`, price: mode === "EXTRAS" ? 0 : product.price, ingredientGroups: groups });
  };
  const save = async (_price: number, _options: SelectedIngredientOption[], selectedOptions: { groupId: string; optionIds: string[] }[]) => {
    if (saving) return;
    const body = { orderId: order.id, mode, ...(mode === "EXTRAS" ? { itemId: selected } : { productId: selected }), quantity, selectedOptions };
    const fingerprint = JSON.stringify(body);
    if (attempt.current.body !== fingerprint) attempt.current = { body: fingerprint, key: crypto.randomUUID() };
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/operations/delivery/additions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: attempt.current.key }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "Não foi possível acrescentar.");
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha de conexão. Tente novamente."); }
    finally { setSaving(false); }
  };
  return <>{!picker && <div className="modal-bg"><div className="modal payment-modal"><button className="modal-close" aria-label="Fechar acréscimos" onClick={onClose}><X/></button><h2>Acrescentar ao pedido</h2><p>{order.customerName}</p><p>O preço será atualizado e somente o complemento será enviado à cozinha.</p><label className="field"><span>O que deseja acrescentar?</span><select value={mode} onChange={event => { setMode(event.target.value as typeof mode); setSelected(""); setQuantity(1); setError(""); }}><option value="EXTRAS">Adicional em um item existente</option><option value="PRODUCT">Novo produto</option></select></label><label className="field"><span>{mode === "EXTRAS" ? "Item do pedido" : "Produto"}</span><select value={selected} onChange={event => { setSelected(event.target.value); setQuantity(1); setError(""); }}><option value="">Selecione</option>{mode === "EXTRAS" ? order.items.map(item => <option key={item.id} value={item.id}>{item.quantity}x {item.productName}{item.selectedOptionsSnapshot?.length ? ` (${item.selectedOptionsSnapshot.map(o => o.optionName).join(", ")})` : ""}</option>) : products.map(product => <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}</select></label><label className="field"><span>Quantidade de unidades que receberão o acréscimo</span><input type="number" min={1} max={mode === "EXTRAS" ? item?.quantity ?? 1 : 99} value={quantity} onChange={event => setQuantity(Number(event.target.value))}/></label>{error && <p role="alert" className="auth-error">{error}</p>}<button className="primary wide" disabled={!selected || !Number.isInteger(quantity) || quantity < 1 || quantity > (mode === "EXTRAS" ? item?.quantity ?? 1 : 99)} onClick={prepare}>Escolher e conferir acréscimo</button></div></div>}{picker && <IngredientPicker quantity={quantity} confirmationLabel="Confirmar acréscimo e avisar cozinha" description="Confira o valor do acréscimo. O pedido será atualizado e a cozinha receberá somente o complemento." product={picker} submitError={error} onClose={() => { if (!saving) setPicker(null); }} onConfirm={save}/>}</>;
}
