import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, FlaskConical, MapPin, Plus, Trash2 } from "lucide-react";
import { calculateCmvSimulation, type CmvSimulationComponentInput } from "@/lib/cmv";

type Product = { id: string; name: string; price: number | null };
type InventoryItem = { id: string; name: string; baseUnit: "GRAM" | "MILLILITER" | "UNIT"; averageCost: number | null };
type ComponentDraft = { inventoryItemId: string; quantity: string; wastePercent: string };
type Recipe = { id: string; productId?: string; productName: string; name: string; yieldQuantity: number; components: { inventoryItemId: string; inventoryItemName: string; baseUnit: "GRAM" | "MILLILITER" | "UNIT"; quantity: number; wastePercent: number }[] };
const units = { GRAM: "g", MILLILITER: "ml", UNIT: "un" } as const;
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

type RecipeSection = "list" | "simulation";

export function RecipeManagement({ establishmentId, establishmentName }: { establishmentId: string; establishmentName: string }) {
  const [section, setSection] = useState<RecipeSection>("list");
  const [products, setProducts] = useState<Product[]>([]); const [inventory, setInventory] = useState<InventoryItem[]>([]); const [recipes, setRecipes] = useState<Recipe[]>([]); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [productId, setProductId] = useState(""); const [name, setName] = useState(""); const [components, setComponents] = useState<ComponentDraft[]>([{ inventoryItemId: "", quantity: "", wastePercent: "0" }]);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch("/api/admin/recipes", { cache: "no-store" }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar as fichas técnicas."); setProducts(data.products); setInventory(data.inventoryItems); setRecipes(data.recipes); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar as fichas técnicas."); } finally { setLoading(false); } }, []);
  useEffect(() => {
    void establishmentId;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [establishmentId, load]);
  const updateComponent = (index: number, field: keyof ComponentDraft, value: string) => setComponents(current => current.map((component, position) => position === index ? { ...component, [field]: value } : component));
  const validComponents = components.every(component => component.inventoryItemId && Number(component.quantity.replace(",", ".")) > 0) && new Set(components.map(component => component.inventoryItemId)).size === components.length;
  const create = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!productId || name.trim().length < 2 || !validComponents) return; setSaving(true); setError(""); const payload = { productId, name: name.trim(), yieldQuantity: 1, components: components.map(component => ({ inventoryItemId: component.inventoryItemId, quantity: Number(component.quantity.replace(",", ".")), wastePercent: Number(component.wastePercent.replace(",", ".")) || 0 })) }; try { const response = await fetch("/api/admin/recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error ?? "Não foi possível cadastrar a ficha técnica."); setProductId(""); setName(""); setComponents([{ inventoryItemId: "", quantity: "", wastePercent: "0" }]); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível cadastrar a ficha técnica."); } finally { setSaving(false); } };

  // "Usar como base": a simulação apenas pré-preenche este formulário de cadastro — não salva
  // nada sozinha. Se o produto já tiver ficha técnica, o cadastro seguirá recusando duplicidade
  // (409) como já fazia antes desta fatia; não existe rota de edição de ficha técnica hoje.
  const useSimulationAsBase = (draft: { productId: string; productName: string; components: ComponentDraft[] }) => {
    setProductId(draft.productId);
    setName(`Ficha — ${draft.productName}`);
    setComponents(draft.components.length > 0 ? draft.components : [{ inventoryItemId: "", quantity: "", wastePercent: "0" }]);
    setSection("list");
  };

  return <div className="recipe-admin">
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Receita por unidade</span><h2>Fichas técnicas</h2><span className="active-unit-label"><MapPin />{establishmentName}</span></div><div className="settings-summary"><span><i /> Receitas ativas</span><strong>{recipes.length}</strong></div></div>
      <nav className="settings-tabs" aria-label="Seções de fichas técnicas">
        <button className={section === "list" ? "active" : ""} onClick={() => setSection("list")}><FlaskConical size={14} />Fichas técnicas</button>
        <button className={section === "simulation" ? "active" : ""} onClick={() => setSection("simulation")}><Calculator size={14} />Simulação de CMV</button>
      </nav>
      {section === "list" && <form className="recipe-form" onSubmit={create}><div className="recipe-basics"><label className="field"><span>Produto vendido</span><select value={productId} onChange={event => { setProductId(event.target.value); const product = products.find(item => item.id === event.target.value); if (product) setName(`Ficha — ${product.name}`); }}><option value="">Selecione</option>{products.map(product => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label className="field"><span>Nome da ficha</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Cachorro-quente simples" /></label></div><div className="recipe-components-head"><span>Composição para uma unidade vendida</span><button type="button" onClick={() => setComponents(current => [...current, { inventoryItemId: "", quantity: "", wastePercent: "0" }])}><Plus />Adicionar item</button></div><div className="recipe-components">{components.map((component, index) => { const selected = inventory.find(item => item.id === component.inventoryItemId); return <div className="recipe-component" key={index}><label className="field"><span>Item de estoque</span><select value={component.inventoryItemId} onChange={event => updateComponent(index, "inventoryItemId", event.target.value)}><option value="">Selecione</option>{inventory.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Quantidade {selected ? `(${units[selected.baseUnit]})` : ""}</span><input inputMode="decimal" value={component.quantity} onChange={event => updateComponent(index, "quantity", event.target.value)} placeholder="0" /></label><label className="field"><span>Perda técnica (%)</span><input inputMode="decimal" value={component.wastePercent} onChange={event => updateComponent(index, "wastePercent", event.target.value)} /></label><button type="button" aria-label="Remover componente" disabled={components.length === 1} onClick={() => setComponents(current => current.filter((_, position) => position !== index))}><Trash2 /></button></div>; })}</div><button className="primary recipe-save" disabled={saving || !productId || name.trim().length < 2 || !validComponents}><FlaskConical />{saving ? "Salvando…" : "Salvar ficha técnica"}</button></form>}
    </section>
    {section === "list" && <>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {loading && <div className="empty"><span>Carregando fichas…</span></div>}
      {!loading && recipes.length === 0 && <div className="big-empty"><FlaskConical /><h2>Nenhuma ficha técnica</h2><p>Cadastre itens de estoque e relacione-os aos produtos vendidos.</p></div>}
      {!loading && recipes.length > 0 && <section className="recipe-list">{recipes.map(recipe => <article key={recipe.id}><div><small>{recipe.productName}</small><strong>{recipe.name}</strong></div><span>Rende {recipe.yieldQuantity} un</span><ul>{recipe.components.map(component => <li key={component.inventoryItemName}><b>{component.inventoryItemName}</b><span>{component.quantity.toLocaleString("pt-BR")} {units[component.baseUnit]} {component.wastePercent > 0 ? `+ ${component.wastePercent}% perda` : ""}</span></li>)}</ul></article>)}</section>}
    </>}
    {section === "simulation" && <CmvSimulationTab products={products} inventory={inventory} recipes={recipes} loading={loading} error={error} onUseAsBase={useSimulationAsBase} />}
  </div>;
}

type SimulationComponentDraft = { inventoryItemId: string; quantity: string; wastePercent: string };

/**
 * Análise/simulação de CMV (ver ADR 0027) — calculadora "e se": não persiste nada. O dono escolhe
 * um produto (com ficha técnica existente ou não), pode editar quantidade/perda/itens à vontade,
 * e simular um preço de venda diferente do atual. Tudo é recalculado no cliente a cada mudança,
 * reaproveitando `calculateCmvSimulation` (`lib/cmv.ts`), que por sua vez reaproveita o custo médio
 * ponderado já calculado no servidor (`weightedAverageCost`) e a fórmula de consumo de receita
 * (`calculateRecipeConsumption`, a mesma usada nas vendas reais).
 */
function CmvSimulationTab({ products, inventory, recipes, loading, error, onUseAsBase }: {
  products: Product[]; inventory: InventoryItem[]; recipes: Recipe[]; loading: boolean; error: string;
  onUseAsBase: (draft: { productId: string; productName: string; components: ComponentDraft[] }) => void;
}) {
  const [productId, setProductId] = useState("");
  const [yieldQuantity, setYieldQuantity] = useState("1");
  const [salePrice, setSalePrice] = useState("");
  const [simComponents, setSimComponents] = useState<SimulationComponentDraft[]>([{ inventoryItemId: "", quantity: "", wastePercent: "0" }]);

  const existingRecipe = useMemo(() => recipes.find(recipe => recipe.productId === productId) ?? null, [recipes, productId]);
  const selectedProduct = useMemo(() => products.find(product => product.id === productId) ?? null, [products, productId]);

  // Ao trocar de produto, recarrega o ponto de partida: a ficha técnica atual (se existir) e o
  // preço de venda atual (se houver oferta cadastrada) — ambos continuam livremente editáveis
  // depois, sem afetar nada real.
  useEffect(() => {
    queueMicrotask(() => {
      if (!productId) { setSimComponents([{ inventoryItemId: "", quantity: "", wastePercent: "0" }]); setYieldQuantity("1"); setSalePrice(""); return; }
      const recipe = recipes.find(candidate => candidate.productId === productId);
      if (recipe) {
        setSimComponents(recipe.components.map(component => ({ inventoryItemId: component.inventoryItemId, quantity: String(component.quantity), wastePercent: String(component.wastePercent) })));
        setYieldQuantity(String(recipe.yieldQuantity));
      } else {
        setSimComponents([{ inventoryItemId: "", quantity: "", wastePercent: "0" }]);
        setYieldQuantity("1");
      }
      const product = products.find(candidate => candidate.id === productId);
      setSalePrice(product?.price != null ? String(product.price) : "");
    });
  }, [productId, recipes, products]);

  const updateComponent = (index: number, field: keyof SimulationComponentDraft, value: string) => setSimComponents(current => current.map((component, position) => position === index ? { ...component, [field]: value } : component));

  const parsedYield = Number(yieldQuantity.replace(",", ".")) || 1;
  const parsedSalePrice = Number(salePrice.replace(",", ".")) || 0;

  const calculationInputs: CmvSimulationComponentInput[] = simComponents
    .filter(component => component.inventoryItemId && Number(component.quantity.replace(",", ".")) > 0)
    .map(component => {
      const item = inventory.find(candidate => candidate.id === component.inventoryItemId);
      return { inventoryItemId: component.inventoryItemId, inventoryItemName: item?.name ?? "Item desconhecido", baseUnit: item?.baseUnit ?? "UNIT", quantity: Number(component.quantity.replace(",", ".")), wastePercent: Number(component.wastePercent.replace(",", ".")) || 0 };
    });

  const result = calculateCmvSimulation(calculationInputs, parsedYield, parsedSalePrice, inventoryItemId => inventory.find(item => item.id === inventoryItemId)?.averageCost ?? null);

  const canUseAsBase = productId && calculationInputs.length > 0 && new Set(simComponents.map(component => component.inventoryItemId)).size === simComponents.length;

  return <section className="cmv-report">
    <section className="panel settings-shell">
      <div className="settings-shell-header"><div><span className="section-kicker">Planejamento — não salva nada</span><h2>Simulação de CMV</h2></div></div>
      <p className="section-note">Simule o CMV e a margem de um produto ANTES de vender — mude quantidades, perda técnica, itens ou o preço de venda à vontade, nada aqui é salvo automaticamente na ficha técnica real. Para persistir mudanças, use &quot;Usar como base&quot; e salve na aba &quot;Fichas técnicas&quot;.</p>
      {loading && <div className="empty"><span>Carregando produtos e itens de estoque…</span></div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      {!loading && !error && <div className="settings-form">
        <label className="field"><span>Produto</span><select value={productId} onChange={event => setProductId(event.target.value)}><option value="">Comece do zero (produto ainda sem ficha)</option>{products.map(product => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
        <label className="field"><span>Rendimento (unidades)</span><input inputMode="decimal" value={yieldQuantity} onChange={event => setYieldQuantity(event.target.value)} /></label>
        <label className="field"><span>Preço de venda simulado</span><input inputMode="decimal" value={salePrice} onChange={event => setSalePrice(event.target.value)} placeholder="0,00" /></label>
      </div>}
      {!loading && !error && productId && !existingRecipe && <p className="section-note">Este produto ainda não tem ficha técnica cadastrada — a simulação começa do zero.</p>}
      {!loading && !error && productId && selectedProduct?.price == null && <p className="section-note">Este produto não tem preço de venda cadastrado nesta unidade — informe um preço simulado manualmente.</p>}
    </section>

    {!loading && !error && <section className="panel settings-shell">
      <div className="recipe-components-head"><span>Composição simulada</span><button type="button" onClick={() => setSimComponents(current => [...current, { inventoryItemId: "", quantity: "", wastePercent: "0" }])}><Plus />Adicionar item</button></div>
      <div className="recipe-components">{simComponents.map((component, index) => {
        const selected = inventory.find(item => item.id === component.inventoryItemId);
        const computed = result.components.find(candidate => candidate.inventoryItemId === component.inventoryItemId);
        return <div className="recipe-component" key={index}>
          <label className="field"><span>Item de estoque</span><select value={component.inventoryItemId} onChange={event => updateComponent(index, "inventoryItemId", event.target.value)}><option value="">Selecione</option>{inventory.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label className="field"><span>Quantidade {selected ? `(${units[selected.baseUnit]})` : ""}</span><input inputMode="decimal" value={component.quantity} onChange={event => updateComponent(index, "quantity", event.target.value)} placeholder="0" /></label>
          <label className="field"><span>Perda técnica (%)</span><input inputMode="decimal" value={component.wastePercent} onChange={event => updateComponent(index, "wastePercent", event.target.value)} /></label>
          <button type="button" aria-label="Remover componente" disabled={simComponents.length === 1} onClick={() => setSimComponents(current => current.filter((_, position) => position !== index))}><Trash2 /></button>
          {computed && <span className="cmv-sim-component-cost">{computed.averageCost === null ? <em className="cmv-unknown-badge"><AlertTriangle size={12} />custo desconhecido</em> : `${money(computed.cost)} (${computed.consumedQuantity.toLocaleString("pt-BR")} ${units[computed.baseUnit as keyof typeof units] ?? computed.baseUnit} × ${money(computed.averageCost)})`}</span>}
        </div>;
      })}</div>
    </section>}

    {!loading && !error && <section className="panel settings-shell">
      <div className="metric-cards">
        <div className="role-card"><b>CMV projetado</b><p className="section-note">{money(result.cmvTotal)}</p></div>
        <div className="role-card"><b>CMV%</b><p className="section-note">{percent(result.cmvPercent)}</p></div>
        <div className="role-card"><b>Margem bruta</b><p className="section-note">{money(result.grossMargin)}</p></div>
        <div className="role-card"><b>Margem%</b><p className="section-note">{percent(result.marginPercent)}</p></div>
      </div>
      {result.hasUnknownCost && <div className="cmv-warning"><AlertTriangle size={16} />Um ou mais itens não têm nenhuma entrada de custo registrada — o CMV projetado está subestimado (só soma os componentes com custo conhecido). Registre o custo desses itens numa entrada de estoque para uma simulação completa.</div>}
      {productId && <button type="button" className="primary recipe-save" disabled={!canUseAsBase} onClick={() => selectedProduct && onUseAsBase({ productId: selectedProduct.id, productName: selectedProduct.name, components: simComponents })}><FlaskConical />Usar como base na ficha técnica</button>}
    </section>}
  </section>;
}
