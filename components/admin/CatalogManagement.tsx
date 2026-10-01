import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ImagePlus, ListOrdered, MapPin, PackagePlus, Plus, Save, Trash2, UtensilsCrossed, X } from "lucide-react";
import { moveItem } from "@/lib/category-order";
import { compareAtPriceError } from "@/lib/catalog-validation";
import { compressImageFile } from "@/lib/image-compression";

type Channel = "POS" | "FLOOR" | "ONLINE" | "DELIVERY";
type CatalogProduct = { id: string; name: string; category: string; description: string | null; price: number; compareAtPrice: number | null; vegetarian: boolean; channels: Channel[]; active: boolean; imageUrl: string | null; isCombo: boolean };
type CategoryItem = { id: string; name: string; productCount: number };

const parseMoney = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
const formatMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
type IngredientOption = { id: string; name: string; priceDelta: number; active: boolean };
type IngredientGroup = { id: string; productId: string; name: string; minSelections: number; maxSelections: number; active: boolean; options: IngredientOption[] };
type ComboOption = { id: string; productId: string; productName: string; priceDelta: number; active: boolean };
type ComboGroup = { id: string; productId: string; name: string; minSelections: number; maxSelections: number; active: boolean; options: ComboOption[] };

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
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(["POS", "FLOOR"]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isCombo, setIsCombo] = useState(false);
  const [vegetarian, setVegetarian] = useState(false);
  const [compareAt, setCompareAt] = useState("");

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
  const numericPrice = parseMoney(price);
  const numericCompareAt = compareAt.trim() ? parseMoney(compareAt) : null;
  const compareError = Number.isFinite(numericPrice) ? compareAtPriceError(numericPrice, numericCompareAt) : null;
  const canCreate = !compareError && name.trim().length >= 2 && category.trim().length >= 2 && Number.isFinite(numericPrice) && numericPrice >= 0 && selectedChannels.length > 0;

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), category: category.trim(), description: description.trim() || undefined, price: numericPrice, channels: selectedChannels, imageUrl: imageUrl ?? undefined, isCombo, vegetarian, compareAtPrice: numericCompareAt }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível cadastrar o produto.");
      setName(""); setCategory(""); setDescription(""); setPrice(""); setSelectedChannels(["POS", "FLOOR"]); setImageUrl(null); setIsCombo(false); setVegetarian(false); setCompareAt("");
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
        <label className="field catalog-description-field"><span>Descrição <small>(opcional)</small></span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} placeholder="Ex.: Pão brioche, carnes, cheddar e bacon." rows={2} /></label>
        <label className="field"><span>Preço</span><div className="money-input"><span>R$</span><input inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} placeholder="0,00" /></div></label>
        <label className="field"><span>Preço anterior <small>(opcional, “de”)</small></span><div className="money-input"><span>R$</span><input inputMode="decimal" value={compareAt} onChange={event => setCompareAt(event.target.value)} placeholder="0,00" aria-invalid={Boolean(compareError)} /></div>{compareError && <small className="field-error">{compareError}</small>}</label>
        <fieldset className="channel-field"><legend>Canais de venda</legend><div className="channel-options">{channels.map(channel => <button type="button" key={channel.id} className={selectedChannels.includes(channel.id) ? "active" : ""} onClick={() => toggleChannel(channel.id)}>{selectedChannels.includes(channel.id) && <Check />}{channel.label}</button>)}</div></fieldset>
        <label className="check-line catalog-combo-toggle"><input type="checkbox" checked={isCombo} onChange={event => setIsCombo(event.target.checked)} /><span><strong>Produto combo</strong><small>Permite escolher itens do cardápio na montagem.</small></span></label>
        <label className="check-line catalog-combo-toggle"><input type="checkbox" checked={vegetarian} onChange={event => setVegetarian(event.target.checked)} /><span><strong>Vegetariano</strong><small>Aparece no filtro “Vegetariano” do pedido online.</small></span></label>
        <ProductImageField imageUrl={imageUrl} onChange={setImageUrl} />
        <button className="primary catalog-add" disabled={!canCreate || saving}><PackagePlus />{saving ? "Incluindo…" : "Incluir produto"}</button>
      </form>
    </section>

    {error && <div className="auth-error" role="alert">{error}</div>}
    {!loading && products.length > 0 ? <CategoryOrderPanel key={[...new Set(products.map(product => product.category))].sort().join("|")} /> : null}
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
  const [description, setDescription] = useState(product.description ?? "");
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(product.channels);
  const [imageUrl, setImageUrl] = useState<string | null>(product.imageUrl);
  const [compareAt, setCompareAt] = useState(product.compareAtPrice !== null ? product.compareAtPrice.toFixed(2).replace(".", ",") : "");
  const [vegetarian, setVegetarian] = useState(product.vegetarian);
  const [rowError, setRowError] = useState("");
  const toggle = (channel: Channel) => setSelectedChannels(current => current.includes(channel) ? current.filter(item => item !== channel) : [...current, channel]);
  const save = async () => {
    const numericPrice = parseMoney(price);
    const numericCompareAt = compareAt.trim() ? parseMoney(compareAt) : null;
    if (!Number.isFinite(numericPrice) || numericPrice < 0) { setRowError("Informe um preço válido."); return; }
    if (selectedChannels.length === 0) { setRowError("Escolha ao menos um canal de venda."); return; }
    const compareError = compareAtPriceError(numericPrice, numericCompareAt);
    if (compareError) { setRowError(compareError); return; }
    setSaving(true); setRowError("");
    try {
      const response = await fetch("/api/admin/catalog", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: product.id, price: numericPrice, compareAtPrice: numericCompareAt, vegetarian, description: description.trim(), channels: selectedChannels, imageUrl: imageUrl ?? undefined }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setRowError(data.error ?? "Não foi possível salvar o produto."); return; }
      setEditing(false); await onSaved();
    } catch { setRowError("Falha ao conectar no servidor."); } finally { setSaving(false); }
  };
  return <article className="catalog-admin-row-wrap">
    <div className="catalog-admin-row">
      <div className="catalog-product-identity">
        <span className="catalog-product-photo">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <UtensilsCrossed />}</span>
        <div><small>{product.category}{product.isCombo ? " · Combo" : ""}{product.vegetarian ? " · Vegetariano" : ""}</small><strong>{product.name}</strong></div>
      </div>
      <div className="catalog-channel-list">{channels.map(channel => <button type="button" disabled={!editing} key={channel.id} className={selectedChannels.includes(channel.id) ? "active" : ""} onClick={() => toggle(channel.id)}>{channel.label}</button>)}</div>
      <div className="catalog-row-price">{editing ? <div className="money-input compact"><span>R$</span><input inputMode="decimal" value={price} onChange={event => { setPrice(event.target.value); setRowError(""); }} /></div> : <>{product.compareAtPrice !== null && <s className="catalog-compare-price">{formatMoney(product.compareAtPrice)}</s>}<strong>{formatMoney(product.price)}</strong></>}</div>
      <div className="catalog-row-actions">
        {editing ? <><button type="button" className="secondary" onClick={() => { setEditing(false); setPrice(product.price.toFixed(2).replace(".", ",")); setDescription(product.description ?? ""); setSelectedChannels(product.channels); setImageUrl(product.imageUrl); setCompareAt(product.compareAtPrice !== null ? product.compareAtPrice.toFixed(2).replace(".", ",") : ""); setVegetarian(product.vegetarian); setRowError(""); }}>Cancelar</button><button type="button" className="primary" disabled={saving || selectedChannels.length === 0} onClick={() => void save()}><Save />Salvar</button></> : <button type="button" className="secondary" onClick={() => setEditing(true)}>Editar oferta</button>}
        <button type="button" className="secondary catalog-groups-toggle" onClick={() => setGroupsOpen(current => !current)}><ChevronDown style={{ transform: groupsOpen ? "rotate(180deg)" : undefined }} />{product.isCombo ? "Produtos do combo" : "Grupos de ingrediente"}</button>
      </div>
    </div>
    {rowError && <div className="auth-error" role="alert">{rowError}</div>}
    {editing && <div className="catalog-row-image-edit"><label className="field"><span>Preço anterior <small>(opcional, “de”)</small></span><div className="money-input compact"><span>R$</span><input inputMode="decimal" value={compareAt} onChange={event => { setCompareAt(event.target.value); setRowError(""); }} placeholder="Sem promoção" /></div><small className="field-hint">Aparece riscado no pedido online. Deixe vazio para remover.</small></label><label className="check-line catalog-combo-toggle"><input type="checkbox" checked={vegetarian} onChange={event => setVegetarian(event.target.checked)} /><span><strong>Vegetariano</strong><small>Vale para todas as unidades.</small></span></label><label className="field catalog-edit-description"><span>Descrição <small>(opcional)</small></span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} placeholder="Ingredientes e diferenciais do produto." rows={3} /></label><ProductImageField imageUrl={imageUrl} onChange={setImageUrl} /></div>}
    {groupsOpen && (product.isCombo ? <ComboGroupsPanel productId={product.id} /> : <IngredientGroupsPanel productId={product.id} />)}
  </article>;
}

// Ordem das categorias no cardápio e no pedido online (ADR 0058). Vale para a organização inteira.
function CategoryOrderPanel() {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [status, setStatus] = useState<{ state: "idle" | "loading" | "saving" | "saved"; error?: string }>({ state: "idle" });

  const load = useCallback(async () => {
    setStatus({ state: "loading" });
    try {
      const response = await fetch("/api/admin/categories", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as categorias.");
      setCategories(data.categories); setSaved(data.categories.map((category: CategoryItem) => category.id)); setStatus({ state: "idle" });
    } catch (cause) { setStatus({ state: "idle", error: cause instanceof Error ? cause.message : "Não foi possível carregar as categorias." }); }
  }, []);

  const toggleOpen = () => { const next = !open; setOpen(next); if (next) void load(); };
  const dirty = categories.map(category => category.id).join("|") !== saved.join("|");
  const move = (index: number, delta: -1 | 1) => { setCategories(current => moveItem(current, index, delta)); setStatus({ state: "idle" }); };

  const save = async () => {
    setStatus({ state: "saving" });
    try {
      const response = await fetch("/api/admin/categories", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: categories.map(category => category.id) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar a ordem.");
      setCategories(data.categories); setSaved(data.categories.map((category: CategoryItem) => category.id)); setStatus({ state: "saved" });
    } catch (cause) { setStatus({ state: "idle", error: cause instanceof Error ? cause.message : "Não foi possível salvar a ordem." }); }
  };

  return <section className="panel category-order-panel">
    <button type="button" className="secondary category-order-toggle" onClick={toggleOpen} aria-expanded={open}><ListOrdered />Ordem das categorias no cardápio<ChevronDown style={{ transform: open ? "rotate(180deg)" : undefined }} /></button>
    {open && <div className="category-order-body">
      <p className="category-order-hint">Define a sequência das categorias no pedido online e no cardápio público, para todas as unidades.</p>
      {status.error && <div className="auth-error" role="alert">{status.error}</div>}
      {status.state === "loading" ? <div className="empty small"><span>Carregando categorias…</span></div> : <ol className="category-order-list">
        {categories.map((category, index) => <li key={category.id}>
          <span className="category-order-position">{index + 1}</span>
          <span className="category-order-name"><strong>{category.name}</strong><small>{category.productCount} {category.productCount === 1 ? "produto" : "produtos"}</small></span>
          <button type="button" className="icon-button" aria-label={`Subir ${category.name}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></button>
          <button type="button" className="icon-button" aria-label={`Descer ${category.name}`} disabled={index === categories.length - 1} onClick={() => move(index, 1)}><ArrowDown /></button>
        </li>)}
      </ol>}
      <div className="settings-actions">
        <button type="button" className="primary" disabled={!dirty || status.state === "saving"} onClick={() => void save()}><Save />{status.state === "saving" ? "Salvando…" : "Salvar ordem"}</button>
        {status.state === "saved" && !dirty && <span className="category-order-saved" role="status"><Check />Ordem salva</span>}
      </div>
    </div>}
  </section>;
}

function ProductImageField({ imageUrl, onChange }: { imageUrl: string | null; onChange: (value: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const compressed = await compressImageFile(file);
      onChange(compressed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível processar a imagem.");
    } finally { setBusy(false); }
  };
  return <div className="product-image-field">
    <div className="product-image-preview">{imageUrl ? <img src={imageUrl} alt="" /> : <UtensilsCrossed />}</div>
    <div className="product-image-actions">
      <label className="secondary product-image-upload">
        <ImagePlus />{busy ? "Processando…" : imageUrl ? "Trocar foto" : "Adicionar foto"}
        <input type="file" accept="image/*" hidden disabled={busy} onChange={event => void handleFile(event.target.files?.[0])} />
      </label>
      {imageUrl && <button type="button" className="secondary" disabled={busy} onClick={() => onChange(null)}>Remover foto</button>}
    </div>
    {error && <span className="product-image-error">{error}</span>}
  </div>;
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

// Combos (ADR 0054): mesma UI de IngredientGroupsPanel/IngredientGroupRow acima, mas cada opção do
// grupo escolhe um PRODUTO existente do cardápio (não um nome livre) — o preço mostrado é o do
// produto escolhido, com um "+ extra" opcional caso o combo cobre a mais por essa escolha.
function ComboGroupsPanel({ productId }: { productId: string }) {
  const [groups, setGroups] = useState<ComboGroup[]>([]);
  const [candidates, setCandidates] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [min, setMin] = useState("1");
  const [max, setMax] = useState("1");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/catalog/combo-groups?productId=${productId}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar os grupos do combo.");
      setGroups(data.groups); setCandidates(data.candidates ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar os grupos do combo."); } finally { setLoading(false); }
  }, [productId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/catalog/combo-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, ...body }) });
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
    if (ok) { setName(""); setMin("1"); setMax("1"); }
  };

  return <div className="ingredient-groups-panel">
    {error && <div className="auth-error">{error}</div>}
    {candidates.length === 0 && !loading && <p className="ingredient-groups-empty">Cadastre outros produtos (que não sejam combo) antes de montar este combo.</p>}
    {loading ? <div className="empty small"><span>Carregando…</span></div> : groups.length === 0 ? <p className="ingredient-groups-empty">Nenhum grupo cadastrado ainda. Crie um grupo com mínimo = máximo = 1 para um combo fixo (ex.: &quot;Hot dog&quot;), ou com várias opções para o cliente escolher (ex.: &quot;Escolha o acompanhamento&quot;).</p> : groups.map(group => <ComboGroupRow key={group.id} group={group} candidates={candidates} saving={saving} onAct={act} />)}
    <div className="ingredient-group-create">
      <label className="field"><span>Nome do grupo</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Hot dog ou Escolha a bebida" /></label>
      <label className="field compact"><span>Mín.</span><input type="number" min={0} max={20} value={min} onChange={event => setMin(event.target.value)} /></label>
      <label className="field compact"><span>Máx.</span><input type="number" min={1} max={20} value={max} onChange={event => setMax(event.target.value)} /></label>
      <button type="button" className="primary" disabled={saving || name.trim().length < 2} onClick={() => void createGroup()}><Plus />Novo grupo</button>
    </div>
  </div>;
}

function ComboGroupRow({ group, candidates, saving, onAct }: { group: ComboGroup; candidates: { id: string; name: string }[]; saving: boolean; onAct: (body: Record<string, unknown>) => Promise<boolean> }) {
  const available = candidates.filter(candidate => !group.options.some(option => option.productId === candidate.id));
  const [optionProductId, setOptionProductId] = useState("");
  const [optionPrice, setOptionPrice] = useState("0,00");
  const addOption = async () => {
    const priceDelta = Number(optionPrice.replace(",", "."));
    if (!optionProductId || !Number.isFinite(priceDelta) || priceDelta < 0) return;
    const ok = await onAct({ action: "CREATE_OPTION", groupId: group.id, optionProductId, priceDelta });
    if (ok) { setOptionProductId(""); setOptionPrice("0,00"); }
  };
  return <div className="ingredient-group-row">
    <div className="ingredient-group-head">
      <div><strong>{group.name}</strong><small>{group.minSelections === group.maxSelections && group.maxSelections === 1 ? "Fixo (1 opção)" : group.minSelections === 0 ? "Opcional" : `Obrigatório · mínimo ${group.minSelections}`} · máximo {group.maxSelections}</small></div>
      <div className="ingredient-group-head-actions">
        <button type="button" className="secondary" disabled={saving} onClick={() => void onAct({ action: "UPDATE_GROUP", groupId: group.id, name: group.name, minSelections: group.minSelections, maxSelections: group.maxSelections, active: !group.active })}>{group.active ? "Desativar" : "Ativar"}</button>
        <button type="button" className="icon-button" aria-label="Remover grupo" disabled={saving} onClick={() => void onAct({ action: "DELETE_GROUP", groupId: group.id })}><Trash2 /></button>
      </div>
    </div>
    <div className="ingredient-option-list">
      {group.options.length === 0 && <span className="ingredient-groups-empty">Nenhum produto adicionado ainda.</span>}
      {group.options.map(option => <div className="ingredient-option-chip" key={option.id}>
        <span>{option.productName}{option.priceDelta > 0 ? ` +${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(option.priceDelta)}` : ""}</span>
        <button type="button" aria-label={option.active ? "Desativar opção" : "Ativar opção"} disabled={saving} onClick={() => void onAct({ action: "UPDATE_OPTION", groupId: group.id, optionId: option.id, priceDelta: option.priceDelta, active: !option.active })}>{option.active ? <Check /> : <X />}</button>
        <button type="button" aria-label="Remover opção" disabled={saving} onClick={() => void onAct({ action: "DELETE_OPTION", groupId: group.id, optionId: option.id })}><Trash2 /></button>
      </div>)}
    </div>
    <div className="ingredient-option-create">
      <select value={optionProductId} onChange={event => setOptionProductId(event.target.value)}>
        <option value="">Selecione um produto…</option>
        {available.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select>
      <div className="money-input compact"><span>R$</span><input inputMode="decimal" value={optionPrice} onChange={event => setOptionPrice(event.target.value)} /></div>
      <button type="button" className="secondary" disabled={saving || !optionProductId} onClick={() => void addOption()}><Plus />Adicionar</button>
    </div>
  </div>;
}
