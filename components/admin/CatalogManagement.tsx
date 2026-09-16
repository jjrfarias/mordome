import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, MapPin, PackagePlus, Plus, Save, Trash2, X } from "lucide-react";

type Channel = "POS" | "FLOOR" | "ONLINE" | "DELIVERY";
type CatalogProduct = { id: string; name: string; category: string; price: number; channels: Channel[]; active: boolean };
type IngredientOption = { id: string; name: string; priceDelta: number; active: boolean };
type IngredientGroup = { id: string; productId: string; name: string; minSelections: number; maxSelections: number; active: boolean; options: IngredientOption[] };

const channels: { id: Channel; label: string }[] = [
  { id: "POS", label: "PDV" },
  { id: "FLOOR", label: "Salão" },
  { id: "ONLINE", label: "Online" },
  { id: "DELIVERY", label: "Delivery" },
];

export function CatalogManagement({ establishmentId, establishmentName }: { establishmentId: string; establishmentName: string }) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(["POS", "FLOOR"]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/catalog", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o cardápio.");
      setProducts(data.products);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o cardápio.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void establishmentId;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [establishmentId, load]);

  const toggleChannel = (channel: Channel) => setSelectedChannels(current => current.includes(channel) ? current.filter(item => item !== channel) : [...current, channel]);
  const numericPrice = Number(price.replace(",", "."));
  const canCreate = name.trim().length >= 2 && category.trim().length >= 2 && Number.isFinite(numericPrice) && numericPrice >= 0 && selectedChannels.length > 0;

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), category: category.trim(), price: numericPrice, channels: selectedChannels }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível cadastrar o produto.");
      setName(""); setCategory(""); setPrice(""); setSelectedChannels(["POS", "FLOOR"]);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar o produto.");
    } finally { setSaving(false); }
  };

  return <div className="catalog-admin">
    <section className="panel settings-shell catalog-intro">
      <div className="settings-shell-header">
        <div><span className="section-kicker">Oferta por unidade</span><h2>Cardápio</h2><span className="active-unit-label"><MapPin />{establishmentName}</span></div>
        <div className="settings-summary" aria-label={`${products.length} produtos cadastrados`}><span><i /> Nesta unidade</span><strong>{products.length}</strong></div>
      </div>
      <form className="catalog-create-form" onSubmit={create}>
        <label className="field"><span>Produto</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Cachorro-quente simples" /></label>
        <label className="field"><span>Categoria</span><input value={category} onChange={event => setCategory(event.target.value)} placeholder="Ex.: Cachorros-quentes" /></label>
        <label className="field"><span>Preço</span><div className="money-input"><span>R$</span><input inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="0,00" /></div></label>
        <fieldset className="channel-field"><legend>Canais de venda</legend><div className="channel-options">{channels.map(channel => <button type="button" key={channel.id} className={selectedChannels.includes(channel.id) ? "active" : ""} onClick={() => toggleChannel(channel.id)}>{selectedChannels.includes(channel.id) && <Check />}{channel.label}</button>)}</div></fieldset>
        <button className="primary catalog-add" disabled={!canCreate || saving}><PackagePlus />{saving ? "Incluindo…" : "Incluir produto"}</button>
      </form>
    </section>

    {error && <div className="auth-error" role="alert">{error}</div>}
    {loading ? <div className="empty"><span>Carregando cardápio…</span></div> : null}
    {!loading && products.length === 0 ? <div className="big-empty"><PackagePlus /><h2>Cardápio vazio</h2><p>Cadastre o primeiro produto vendido nesta operação.</p></div> : null}
    {!loading && products.length > 0 ? <section className="catalog-list">{products.map(product => <CatalogRow key={product.id} product={product} onSaved={load} />)}</section> : null}
  </div>;
}

function CatalogRow({ product, onSaved }: { product: CatalogProduct; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [price, setPrice] = useState(product.price.toFixed(2).replace(".", ","));
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(product.channels);
  const toggle = (channel: Channel) => setSelectedChannels(current => current.includes(channel) ? current.filter(item => item !== channel) : [...current, channel]);
  const save = async () => {
    const numericPrice = Number(price.replace(",", "."));
    if (!Number.isFinite(numericPrice) || numericPrice < 0 || selectedChannels.length === 0) return;
    setSaving(true);
    const response = await fetch("/api/admin/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, price: numericPrice, channels: selectedChannels }) });
    setSaving(false);
    if (response.ok) { setEditing(false); await onSaved(); }
  };
  return <article className="catalog-admin-row-wrap">
    <div className="catalog-admin-row">
      <div className="catalog-product-identity"><span>{product.name.slice(0, 1).toUpperCase()}</span><div><small>{product.category}</small><strong>{product.name}</strong></div></div>
      <div className="catalog-channel-list">{channels.map(channel => <button type="button" disabled={!editing} key={channel.id} className={selectedChannels.includes(channel.id) ? "active" : ""} onClick={() => toggle(channel.id)}>{channel.label}</button>)}</div>
      <div className="catalog-row-price">{editing ? <div className="money-input compact"><span>R$</span><input inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} /></div> : <strong>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(product.price)}</strong>}</div>
      <div className="catalog-row-actions">
        {editing ? <><button type="button" className="secondary" onClick={() => { setEditing(false); setPrice(product.price.toFixed(2).replace(".", ",")); setSelectedChannels(product.channels); }}>Cancelar</button><button type="button" className="primary" disabled={saving || selectedChannels.length === 0} onClick={() => void save()}><Save />Salvar</button></> : <button type="button" className="secondary" onClick={() => setEditing(true)}>Editar oferta</button>}
        <button type="button" className="secondary catalog-groups-toggle" onClick={() => setGroupsOpen(current => !current)}><ChevronDown style={{ transform: groupsOpen ? "rotate(180deg)" : undefined }} />Grupos de ingrediente</button>
      </div>
    </div>
    {groupsOpen && <IngredientGroupsPanel productId={product.id} />}
  </article>;
}

function IngredientGroupsPanel({ productId }: { productId: string }) {
  const [groups, setGroups] = useState<IngredientGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [min, setMin] = useState("0");
  const [max, setMax] = useState("1");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/catalog/groups?productId=${productId}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os grupos.");
      setGroups(data.groups);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os grupos."); } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/catalog/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, ...body }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar.");
      await load();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); return false; } finally { setSaving(false); }
  };

  const createGroup = async () => {
    const minSelections = Math.max(0, Number(min) || 0); const maxSelections = Math.max(1, Number(max) || 1);
    if (name.trim().length < 2 || maxSelections < minSelections) return;
    const ok = await act({ action: "CREATE_GROUP", name: name.trim(), minSelections, maxSelections });
    if (ok) { setName(""); setMin("0"); setMax("1"); }
  };

  return <div className="ingredient-groups-panel">
    {error && <div className="auth-error">{error}</div>}
    {loading ? <div className="empty small"><span>Carregando grupos…</span></div> : groups.length === 0 ? <p className="ingredient-groups-empty">Nenhum grupo de ingrediente cadastrado. Crie o primeiro, ex.: &quot;Escolha o molho&quot; ou &quot;Adicionais&quot;.</p> : groups.map(group => <IngredientGroupRow key={group.id} group={group} saving={saving} onAct={act} />)}
    <div className="ingredient-group-create">
      <label className="field"><span>Nome do grupo</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Molhos" /></label>
      <label className="field compact"><span>Mín.</span><input type="number" min={0} max={20} value={min} onChange={event => setMin(event.target.value)} /></label>
      <label className="field compact"><span>Máx.</span><input type="number" min={1} max={20} value={max} onChange={event => setMax(event.target.value)} /></label>
      <button type="button" className="primary" disabled={saving || name.trim().length < 2} onClick={() => void createGroup()}><Plus />Novo grupo</button>
    </div>
  </div>;
}

function IngredientGroupRow({ group, saving, onAct }: { group: IngredientGroup; saving: boolean; onAct: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [optionName, setOptionName] = useState("");
  const [optionPrice, setOptionPrice] = useState("0,00");
  const addOption = async () => {
    const priceDelta = Number(optionPrice.replace(",", "."));
    if (optionName.trim().length < 1 || !Number.isFinite(priceDelta) || priceDelta < 0) return;
    const ok = await onAct({ action: "CREATE_OPTION", groupId: group.id, name: optionName.trim(), priceDelta });
    if (ok) { setOptionName(""); setOptionPrice("0,00"); }
  };
  return <div className="ingredient-group-row">
    <div className="ingredient-group-head">
      <div><strong>{group.name}</strong><small>{group.minSelections === 0 ? "Opcional" : `Obrigatório · mínimo ${group.minSelections}`} · máximo {group.maxSelections}</small></div>
      <div className="ingredient-group-head-actions">
        <button type="button" className="secondary" disabled={saving} onClick={() => void onAct({ action: "UPDATE_GROUP", groupId: group.id, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: !group.active })}>{group.active ? "Desativar" : "Ativar"}</button>
        <button type="button" className="icon-button" aria-label="Remover grupo" disabled={saving} onClick={() => void onAct({ action: "DELETE_GROUP", groupId: group.id })}><Trash2 /></button>
      </div>
    </div>
    <div className="ingredient-option-list">
      {group.options.length === 0 && <span className="ingredient-groups-empty">Nenhuma opção ainda.</span>}
      {group.options.map(option => <div className="ingredient-option-chip" key={option.id}>
        <span>{option.name}{option.priceDelta > 0 ? ` +${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(option.priceDelta)}` : ""}</span>
        <button type="button" aria-label={option.active ? "Desativar opção" : "Ativar opção"} disabled={saving} onClick={() => void onAct({ action: "UPDATE_OPTION", groupId: group.id, optionId: option.id, name: option.name, priceDelta: option.priceDelta, active: !option.active })}>{option.active ? <Check /> : <X />}</button>
        <button type="button" aria-label="Remover opção" disabled={saving} onClick={() => void onAct({ action: "DELETE_OPTION", groupId: group.id, optionId: option.id })}><Trash2 /></button>
      </div>)}
    </div>
    <div className="ingredient-option-create">
      <input value={optionName} onChange={event => setOptionName(event.target.value)} placeholder="Nome da opção (ex.: Bacon)" />
      <div className="money-input compact"><span>R$</span><input inputMode="decimal" value={optionPrice} onChange={event => setOptionPrice(event.target.value)} /></div>
      <button type="button" className="secondary" disabled={saving || optionName.trim().length < 1} onClick={() => void addOption()}><Plus />Adicionar</button>
    </div>
  </div>;
}
