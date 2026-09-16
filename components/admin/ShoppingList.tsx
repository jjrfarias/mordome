import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Plus, ShoppingCart, TrendingDown } from "lucide-react";

type BaseUnit = "GRAM" | "MILLILITER" | "UNIT";
type InventoryItemOption = { id: string; establishmentItemId: string | null; name: string; configured: boolean };
type Supplier = { id: string; name: string; active: boolean };
type Suggestion = { inventoryItemId: string; name: string; baseUnit: BaseUnit; balance: number; minimumStock: number; suggestedQuantity: number };
type ManualItem = { id: string; inventoryItemId: string; name: string; baseUnit: BaseUnit; desiredQuantity: number; notes: string | null; createdAt: string };

const unitLabels: Record<BaseUnit, string> = { GRAM: "g", MILLILITER: "ml", UNIT: "un" };

type SelectionKey = string;
function suggestionKey(inventoryItemId: string): SelectionKey { return `suggestion:${inventoryItemId}`; }
function manualKey(itemId: string): SelectionKey { return `manual:${itemId}`; }

export function ShoppingList({ items }: { items: InventoryItemOption[] }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<SelectionKey>>(new Set());
  const [supplierId, setSupplierId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [success, setSuccess] = useState("");

  const [manualInventoryItemId, setManualInventoryItemId] = useState(() => items.find(item => item.configured)?.establishmentItemId ?? "");
  const [manualQuantity, setManualQuantity] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [addingManual, setAddingManual] = useState(false);

  const configuredItems = items.filter(item => item.configured && item.establishmentItemId);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/inventory/shopping-list", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar a lista de compras.");
      setSuggestions(data.suggestions ?? []);
      setManualItems(data.manualItems ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a lista de compras.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/finance/suppliers", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (response.ok) setSuppliers((data.suppliers ?? []).filter((supplier: Supplier) => supplier.active));
      } catch { /* fornecedores são opcionais nesta tela */ }
    })();
  }, []);

  const toggle = (key: SelectionKey) => {
    setSuccess("");
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const addManualItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numeric = Number(manualQuantity.replace(",", "."));
    if (!manualInventoryItemId || !Number.isFinite(numeric) || numeric <= 0) return;
    setAddingManual(true); setError("");
    try {
      const response = await fetch("/api/admin/inventory/shopping-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ADD_ITEM", inventoryItemId: manualInventoryItemId, desiredQuantity: numeric, notes: manualNotes.trim() || undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível adicionar o item.");
      setManualQuantity(""); setManualNotes(""); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível adicionar o item.");
    } finally { setAddingManual(false); }
  };

  const markResolved = async (itemId: string) => {
    setError("");
    try {
      const response = await fetch("/api/admin/inventory/shopping-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "UPDATE_ITEM", itemId, resolved: true }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar o item.");
      setSelected(current => { const next = new Set(current); next.delete(manualKey(itemId)); return next; });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o item.");
    }
  };

  const selectedCount = selected.size;

  const generateOrder = async () => {
    const payloadItems = [
      ...suggestions.filter(suggestion => selected.has(suggestionKey(suggestion.inventoryItemId))).map(suggestion => ({ inventoryItemId: suggestion.inventoryItemId, quantity: suggestion.suggestedQuantity })),
      ...manualItems.filter(item => selected.has(manualKey(item.id))).map(item => ({ inventoryItemId: item.inventoryItemId, quantity: item.desiredQuantity, shoppingListItemId: item.id })),
    ];
    if (payloadItems.length === 0) return;
    setGenerating(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/admin/inventory/shopping-list/generate-order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierId: supplierId || undefined, items: payloadItems }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível gerar a ordem de compra.");
      setSelected(new Set());
      setSuccess("Ordem de compra criada em rascunho. Ajuste o custo estimado na aba \"Ordens de compra\".");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar a ordem de compra.");
    } finally { setGenerating(false); }
  };

  const isEmpty = useMemo(() => !loading && suggestions.length === 0 && manualItems.length === 0, [loading, suggestions, manualItems]);

  return <div className="shopping-list">
    <section className="panel">
      <h3>Adicionar item manual</h3>
      <p className="panel-hint">Quer comprar algo que ainda não está abaixo do mínimo? Adicione aqui.</p>
      <form className="inventory-create-form" onSubmit={addManualItem}>
        <label className="field"><span>Item</span>
          <select value={manualInventoryItemId} onChange={event => setManualInventoryItemId(event.target.value)}>
            {configuredItems.length === 0 && <option value="">Nenhum item configurado nesta unidade</option>}
            {configuredItems.map(item => <option key={item.establishmentItemId!} value={item.establishmentItemId!}>{item.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Quantidade desejada</span><input inputMode="decimal" value={manualQuantity} onChange={event => setManualQuantity(event.target.value)} placeholder="0" /></label>
        <label className="field"><span>Observação (opcional)</span><input value={manualNotes} onChange={event => setManualNotes(event.target.value)} placeholder="Ex.: Para o fim de semana" /></label>
        <button className="primary" disabled={addingManual || configuredItems.length === 0}><Plus />Adicionar à lista</button>
      </form>
    </section>

    {error && <div className="auth-error" role="alert">{error}</div>}
    {success && <div className="stock-count-success"><CheckCircle2 />{success}</div>}
    {loading && <div className="empty"><span>Carregando lista de compras…</span></div>}

    {!loading && isEmpty && <div className="big-empty"><ShoppingCart /><h2>Nada para comprar agora</h2><p>Todos os itens estão dentro do estoque mínimo e não há itens manuais na lista.</p></div>}

    {!loading && !isEmpty && <>
      <div className="shopping-list-bar">
        <div><span>Itens selecionados</span><strong>{selectedCount}</strong></div>
        <label className="field"><span>Fornecedor (opcional)</span>
          <select value={supplierId} onChange={event => setSupplierId(event.target.value)}>
            <option value="">Sem fornecedor cadastrado</option>
            {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </label>
        <button className="primary" disabled={selectedCount === 0 || generating} onClick={() => void generateOrder()}><ShoppingCart />Gerar ordem de compra</button>
      </div>

      {suggestions.length > 0 && <section>
        <h3 className="shopping-list-section-title"><TrendingDown size={14} />Sugestões automáticas (abaixo do mínimo)</h3>
        <div className="inventory-list">
          {suggestions.map(suggestion => {
            const key = suggestionKey(suggestion.inventoryItemId);
            const unit = unitLabels[suggestion.baseUnit];
            return <article key={key} className="inventory-row shopping-list-row low">
              <label className="shopping-list-checkbox"><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} /></label>
              <div className="inventory-icon"><ShoppingCart /></div>
              <div className="inventory-identity"><small>Saldo {suggestion.balance.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {unit} · mínimo {suggestion.minimumStock.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {unit}</small><strong>{suggestion.name}</strong></div>
              <div className="inventory-balance"><small>Sugestão de compra</small><strong>{suggestion.suggestedQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} <em>{unit}</em></strong><span>Estoque baixo</span></div>
            </article>;
          })}
        </div>
      </section>}

      {manualItems.length > 0 && <section>
        <h3 className="shopping-list-section-title"><ClipboardList size={14} />Itens manuais</h3>
        <div className="inventory-list">
          {manualItems.map(item => {
            const key = manualKey(item.id);
            const unit = unitLabels[item.baseUnit];
            return <article key={key} className="inventory-row shopping-list-row">
              <label className="shopping-list-checkbox"><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} /></label>
              <div className="inventory-icon"><ShoppingCart /></div>
              <div className="inventory-identity"><small>{item.notes || "Sem observação"}</small><strong>{item.name}</strong></div>
              <div className="inventory-balance"><small>Quantidade desejada</small><strong>{item.desiredQuantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} <em>{unit}</em></strong></div>
              <div className="inventory-actions"><button className="secondary" onClick={() => void markResolved(item.id)}><CheckCircle2 />Já providenciado</button></div>
            </article>;
          })}
        </div>
      </section>}
    </>}
  </div>;
}
