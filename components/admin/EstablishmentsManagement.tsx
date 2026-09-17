import { useEffect, useState } from "react";
import { ImagePlus, UtensilsCrossed } from "lucide-react";
import { compressImageFile } from "@/lib/image-compression";

type EstablishmentAddress = {
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
};

type EstablishmentStorefront = {
  logoUrl: string | null;
  bannerUrl: string | null;
  highlightProductId: string | null;
  highlightHeadline: string | null;
};

type EstablishmentItem = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
} & EstablishmentAddress & EstablishmentStorefront;

type CatalogProductOption = { id: string; name: string };

type EstablishmentsPayload = {
  establishments: EstablishmentItem[];
};

type EstablishmentFormState = {
  id: string;
  name: string;
  originalName: string;
  editing: boolean;
  saving: boolean;
};

type AddressFormState = { postalCode: string; street: string; number: string; complement: string; neighborhood: string; city: string; state: string; editing: boolean; saving: boolean; error: string; lookingUp: boolean };

type StorefrontFormState = { logoUrl: string | null; bannerUrl: string | null; highlightProductId: string; highlightHeadline: string; editing: boolean; saving: boolean; error: string; busy: boolean };

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function addressLine(establishment: EstablishmentItem) {
  const parts = [establishment.street && establishment.number ? `${establishment.street}, ${establishment.number}` : establishment.street, establishment.neighborhood, establishment.city && establishment.state ? `${establishment.city}/${establishment.state}` : establishment.city].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function EstablishmentsManagement({ activeEstablishmentId, onChanged }: { activeEstablishmentId: string; onChanged: () => Promise<void> }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<EstablishmentItem[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [edits, setEdits] = useState<EstablishmentFormState[]>([]);
  const [addressEdits, setAddressEdits] = useState<Record<string, AddressFormState>>({});
  const [storefrontEdits, setStorefrontEdits] = useState<Record<string, StorefrontFormState>>({});
  const [catalogProducts, setCatalogProducts] = useState<CatalogProductOption[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const activeCount = rows.filter((row) => row.active).length;

  const load = async () => {
    setError("");
    const response = await fetch("/api/admin/establishments", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Não foi possível carregar os estabelecimentos.");
      setRows([]);
      setEdits([]);
      setLoading(false);
      return;
    }
    const parsed = data as EstablishmentsPayload;
    setRows(parsed.establishments);
    setEdits(
      parsed.establishments.map((establishment) => ({
        id: establishment.id,
        name: establishment.name,
        originalName: establishment.name,
        editing: false,
        saving: false,
      })),
    );
    setAddressEdits(current => Object.fromEntries(parsed.establishments.map(establishment => {
      const previous = current[establishment.id];
      if (previous?.editing) return [establishment.id, previous];
      return [establishment.id, { postalCode: establishment.postalCode ? formatCep(establishment.postalCode) : "", street: establishment.street ?? "", number: establishment.number ?? "", complement: establishment.complement ?? "", neighborhood: establishment.neighborhood ?? "", city: establishment.city ?? "", state: establishment.state ?? "", editing: false, saving: false, error: "", lookingUp: false }];
    })));
    setStorefrontEdits(current => Object.fromEntries(parsed.establishments.map(establishment => {
      const previous = current[establishment.id];
      if (previous?.editing) return [establishment.id, previous];
      return [establishment.id, { logoUrl: establishment.logoUrl, bannerUrl: establishment.bannerUrl, highlightProductId: establishment.highlightProductId ?? "", highlightHeadline: establishment.highlightHeadline ?? "", editing: false, saving: false, error: "", busy: false }];
    })));
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Lista de produtos para o seletor de "destaque" (ADR 0053) — reaproveita o catálogo da unidade
    // ativa na sessão; nome/id do produto não muda entre unidades, só preço/canais (não usados aqui).
    void (async () => {
      const response = await fetch("/api/admin/catalog", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) setCatalogProducts((data.products ?? []).map((product: { id: string; name: string }) => ({ id: product.id, name: product.name })));
    })();
  }, []);

  const setEditMode = (id: string, editing: boolean) => {
    setEdits((current) => current.map((item) => (item.id === id ? { ...item, editing } : item)));
  };
  const setDraft = (id: string, nameValue: string) => {
    setEdits((current) => current.map((item) => (item.id === id ? { ...item, name: nameValue } : item)));
  };
  const setSavingState = (id: string, savingValue: boolean) => {
    setEdits((current) => current.map((item) => (item.id === id ? { ...item, saving: savingValue } : item)));
  };

  const editState = (id: string) => edits.find((item) => item.id === id);
  const canCreate = name.trim().length >= 2;

  const createEstablishment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || saving) return;

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/admin/establishments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Não foi possível criar o estabelecimento.");
      } else {
        setName("");
        await load();
        await onChanged();
      }
    } catch {
      setError("Falha ao conectar no servidor.");
    } finally {
      setSaving(false);
    }
  };

  const saveName = async (id: string) => {
    const draft = editState(id);
    if (!draft || saving || !draft.name.trim() || draft.name.trim() === draft.originalName) return;

    const payload = { establishmentId: id, name: draft.name.trim() };
    setSavingState(id, true);
    setError("");
    try {
      const response = await fetch("/api/admin/establishments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Não foi possível atualizar o nome.");
      } else {
        await load();
        await onChanged();
      }
    } catch {
      setError("Falha ao conectar no servidor.");
    } finally {
      setSavingState(id, false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    setError("");
    const wasSaving = edits.some((item) => item.saving);
    if (wasSaving || saving) return;

    setSavingState(id, true);
    try {
      const response = await fetch("/api/admin/establishments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId: id, active: !active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Não foi possível alterar o status.");
        return;
      }
      await load();
      await onChanged();
    } catch {
      setError("Falha ao conectar no servidor.");
    } finally {
      setSavingState(id, false);
    }
  };

  const startEdit = (id: string, name: string) => {
    setEditMode(id, true);
    setDraft(id, name);
  };

  const cancelEdit = (id: string) => {
    const current = editState(id);
    if (!current) return;
    setDraft(id, current.originalName);
    setEditMode(id, false);
  };

  const addressState = (id: string) => addressEdits[id];
  const setAddressDraft = (id: string, patch: Partial<AddressFormState>) => setAddressEdits(current => ({ ...current, [id]: { ...current[id], ...patch } }));

  // Busca de endereço por CEP (ViaCEP, api pública sem chave, só o CEP digitado é enviado — sem
  // dado de cliente/tenant) para preencher rua/bairro/cidade/UF automaticamente; número e
  // complemento continuam manuais, a ViaCEP não devolve isso.
  const lookupCep = async (id: string) => {
    const draft = addressState(id);
    const digits = (draft?.postalCode ?? "").replace(/\D/g, "");
    if (digits.length !== 8) { setAddressDraft(id, { error: "Digite um CEP com 8 dígitos." }); return; }
    setAddressDraft(id, { lookingUp: true, error: "" });
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.erro) { setAddressDraft(id, { error: "CEP não encontrado." }); return; }
      setAddressDraft(id, { street: data.logradouro ?? "", neighborhood: data.bairro ?? "", city: data.localidade ?? "", state: data.uf ?? "" });
    } catch {
      setAddressDraft(id, { error: "Não foi possível buscar o CEP agora." });
    } finally {
      setAddressDraft(id, { lookingUp: false });
    }
  };

  const startEditAddress = (id: string) => setAddressDraft(id, { editing: true, error: "" });
  const cancelEditAddress = (id: string, establishment: EstablishmentItem) => setAddressDraft(id, { editing: false, error: "", postalCode: establishment.postalCode ? formatCep(establishment.postalCode) : "", street: establishment.street ?? "", number: establishment.number ?? "", complement: establishment.complement ?? "", neighborhood: establishment.neighborhood ?? "", city: establishment.city ?? "", state: establishment.state ?? "" });

  const saveAddress = async (id: string) => {
    const draft = addressState(id);
    if (!draft || saving) return;
    setAddressDraft(id, { saving: true, error: "" });
    try {
      const response = await fetch("/api/admin/establishments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId: id, postalCode: draft.postalCode, street: draft.street, number: draft.number, complement: draft.complement, neighborhood: draft.neighborhood, city: draft.city, state: draft.state }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setAddressDraft(id, { error: data.error ?? "Não foi possível salvar o endereço." }); return; }
      setAddressDraft(id, { editing: false });
      await load();
    } catch {
      setAddressDraft(id, { error: "Falha ao conectar no servidor." });
    } finally {
      setAddressDraft(id, { saving: false });
    }
  };

  const storefrontState = (id: string) => storefrontEdits[id];
  const setStorefrontDraft = (id: string, patch: Partial<StorefrontFormState>) => setStorefrontEdits(current => ({ ...current, [id]: { ...current[id], ...patch } }));
  const startEditStorefront = (id: string) => setStorefrontDraft(id, { editing: true, error: "" });
  const cancelEditStorefront = (id: string, establishment: EstablishmentItem) => setStorefrontDraft(id, { editing: false, error: "", logoUrl: establishment.logoUrl, bannerUrl: establishment.bannerUrl, highlightProductId: establishment.highlightProductId ?? "", highlightHeadline: establishment.highlightHeadline ?? "" });

  const handleStorefrontImage = async (id: string, field: "logoUrl" | "bannerUrl", file: File | undefined) => {
    if (!file) return;
    setStorefrontDraft(id, { busy: true, error: "" });
    try {
      const compressed = await compressImageFile(file);
      setStorefrontDraft(id, { [field]: compressed } as Partial<StorefrontFormState>);
    } catch (cause) {
      setStorefrontDraft(id, { error: cause instanceof Error ? cause.message : "Não foi possível processar a imagem." });
    } finally {
      setStorefrontDraft(id, { busy: false });
    }
  };

  const saveStorefront = async (id: string) => {
    const draft = storefrontState(id);
    if (!draft || saving) return;
    setStorefrontDraft(id, { saving: true, error: "" });
    try {
      const response = await fetch("/api/admin/establishments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ establishmentId: id, logoUrl: draft.logoUrl ?? "", bannerUrl: draft.bannerUrl ?? "", highlightProductId: draft.highlightProductId, highlightHeadline: draft.highlightHeadline }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setStorefrontDraft(id, { error: data.error ?? "Não foi possível salvar a vitrine." }); return; }
      setStorefrontDraft(id, { editing: false });
      await load();
    } catch {
      setStorefrontDraft(id, { error: "Falha ao conectar no servidor." });
    } finally {
      setStorefrontDraft(id, { saving: false });
    }
  };

  // Links públicos (ADR 0045): a URL usa o `id` do estabelecimento, nunca gerada/exibida em
  // nenhuma outra tela — dono precisava montar isso manualmente para compartilhar com o cliente
  // final. Copiado direto do navegador (window.location.origin), sem depender de variável de
  // ambiente de domínio público.
  const copyLink = async (establishmentId: string, kind: "cardapio" | "pedido-online") => {
    const url = `${window.location.origin}/${kind}/${establishmentId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(`${establishmentId}:${kind}`);
      setTimeout(() => setCopied(current => current === `${establishmentId}:${kind}` ? null : current), 2000);
    } catch {
      setError("Não foi possível copiar o link — copie manualmente: " + url);
    }
  };

  const hasResults = !loading && !error && rows.length > 0;

  return <section className="page-content">
    <section className="panel settings-shell">
      <div className="settings-shell-header">
        <div>
          <span className="section-kicker">Estrutura da operação</span>
          <h2>Estabelecimentos</h2>
        </div>
        <div className="settings-summary" aria-label={`${activeCount} de ${rows.length} unidades ativas`}>
          <span><i /> Em operação</span>
          <strong>{activeCount}<small>/{rows.length}</small></strong>
        </div>
      </div>

      <form onSubmit={createEstablishment} className="settings-form">
        <label className="field">
          <span>Novo estabelecimento</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Digite o nome" />
        </label>
        <button className="primary" type="submit" disabled={!canCreate || saving}>Incluir</button>
      </form>
    </section>

    {loading ? <div className="empty"><span>Carregando estabelecimentos...</span></div> : null}
    {error && <div className="auth-error">{error}</div>}

    {hasResults ? <section className="panel settings-table-wrap">
      <div className="settings-table-head">
        <span>Unidade</span>
        <span>Slug</span>
        <span>Status</span>
        <span>Ações</span>
      </div>
      <div className="settings-table-body">
        {rows.map((establishment) => {
          const edit = editState(establishment.id);
          const isEditing = edit?.editing ?? false;
          const editableName = edit?.name ?? "";

          return <article className="settings-row" key={establishment.id}>
            <div className="settings-cell">
              {isEditing ? <input className="inline-input" value={editableName} onChange={(event) => setDraft(establishment.id, event.target.value)} /> : <strong>{establishment.name}</strong>}
            </div>
            <div className="settings-cell settings-slug">{establishment.slug}</div>
            <div className="settings-cell">
              <span className={`status-pill ${establishment.active ? "status-active" : "status-inactive"}`}>
                {establishment.active ? "Ativo" : "Inativo"}
              </span>
            </div>
            <div className="settings-cell">
              <div className="settings-actions">
                <button type="button" className="secondary" disabled={edit?.saving || saving || (isEditing && (!editableName.trim() || editableName.trim() === establishment.name))} onClick={() => {
                  if (!isEditing) return startEdit(establishment.id, establishment.name);
                  void saveName(establishment.id);
                }}>
                  {isEditing ? "Salvar nome" : "Editar"}
                </button>
                {isEditing && <button type="button" className="secondary" onClick={() => cancelEdit(establishment.id)}>
                  Cancelar
                </button>}
                <button type="button" className={`secondary ${establishment.active ? "warn" : ""}`} title={establishment.id === activeEstablishmentId && establishment.active ? "Troque a unidade ativa antes de desativá-la" : undefined} disabled={edit?.saving || saving || (establishment.active && (activeCount <= 1 || establishment.id === activeEstablishmentId))} onClick={() => toggleActive(establishment.id, establishment.active)}>
                  {establishment.active ? "Inativar" : "Ativar"}
                </button>
              </div>
              <div className="settings-actions settings-actions-links">
                <button type="button" className="secondary" onClick={() => void copyLink(establishment.id, "cardapio")}>
                  {copied === `${establishment.id}:cardapio` ? "Link copiado!" : "Copiar link do cardápio"}
                </button>
                <button type="button" className="secondary" onClick={() => void copyLink(establishment.id, "pedido-online")}>
                  {copied === `${establishment.id}:pedido-online` ? "Link copiado!" : "Copiar link de pedido online"}
                </button>
              </div>
            </div>
            <div className="settings-address">
              {(() => {
                const addr = addressState(establishment.id);
                if (!addr) return null;
                if (!addr.editing) return <div className="settings-address-line">
                  <span>{addressLine(establishment) ?? "Endereço não cadastrado"}</span>
                  <button type="button" className="secondary" onClick={() => startEditAddress(establishment.id)}>{addressLine(establishment) ? "Editar endereço" : "Cadastrar endereço"}</button>
                </div>;
                return <div>
                  <div className="settings-address-cep">
                    <label className="field"><span>CEP</span><input value={addr.postalCode} onChange={event => setAddressDraft(establishment.id, { postalCode: formatCep(event.target.value) })} placeholder="00000-000" /></label>
                    <button type="button" className="secondary" disabled={addr.lookingUp} onClick={() => void lookupCep(establishment.id)}>{addr.lookingUp ? "Buscando…" : "Buscar CEP"}</button>
                  </div>
                  {addr.error && <div className="auth-error" style={{ marginTop: 6 }}>{addr.error}</div>}
                  <div className="settings-address-form">
                    <label className="field wide"><span>Rua</span><input value={addr.street} onChange={event => setAddressDraft(establishment.id, { street: event.target.value })} /></label>
                    <label className="field"><span>Número</span><input value={addr.number} onChange={event => setAddressDraft(establishment.id, { number: event.target.value })} /></label>
                    <label className="field"><span>Complemento</span><input value={addr.complement} onChange={event => setAddressDraft(establishment.id, { complement: event.target.value })} /></label>
                    <label className="field"><span>Bairro</span><input value={addr.neighborhood} onChange={event => setAddressDraft(establishment.id, { neighborhood: event.target.value })} /></label>
                    <label className="field"><span>Cidade</span><input value={addr.city} onChange={event => setAddressDraft(establishment.id, { city: event.target.value })} /></label>
                    <label className="field"><span>UF</span><input value={addr.state} maxLength={2} onChange={event => setAddressDraft(establishment.id, { state: event.target.value.toUpperCase() })} /></label>
                  </div>
                  <div className="settings-actions" style={{ marginTop: 10 }}>
                    <button type="button" className="primary" disabled={addr.saving} onClick={() => void saveAddress(establishment.id)}>{addr.saving ? "Salvando…" : "Salvar endereço"}</button>
                    <button type="button" className="secondary" onClick={() => cancelEditAddress(establishment.id, establishment)}>Cancelar</button>
                  </div>
                </div>;
              })()}
            </div>
            <div className="settings-address">
              {(() => {
                const store = storefrontState(establishment.id);
                if (!store) return null;
                if (!store.editing) return <div className="settings-address-line">
                  <span>{establishment.logoUrl || establishment.bannerUrl || establishment.highlightProductId ? "Vitrine configurada" : "Vitrine do delivery não configurada"}</span>
                  <button type="button" className="secondary" onClick={() => startEditStorefront(establishment.id)}>Editar vitrine do delivery</button>
                </div>;
                return <div>
                  {store.error && <div className="auth-error" style={{ marginBottom: 8 }}>{store.error}</div>}
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                    <div className="product-image-field">
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#82786c", display: "block", marginBottom: 6 }}>Logo</span>
                      <div className="product-image-preview">{store.logoUrl ? <img src={store.logoUrl} alt="" /> : <UtensilsCrossed />}</div>
                      <div className="product-image-actions">
                        <label className="secondary product-image-upload">
                          <ImagePlus />{store.busy ? "Processando…" : store.logoUrl ? "Trocar logo" : "Adicionar logo"}
                          <input type="file" accept="image/*" hidden disabled={store.busy} onChange={event => void handleStorefrontImage(establishment.id, "logoUrl", event.target.files?.[0])} />
                        </label>
                        {store.logoUrl && <button type="button" className="secondary" disabled={store.busy} onClick={() => setStorefrontDraft(establishment.id, { logoUrl: null })}>Remover</button>}
                      </div>
                    </div>
                    <div className="product-image-field">
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "#82786c", display: "block", marginBottom: 6 }}>Banner de capa</span>
                      <div className="product-image-preview" style={{ width: 160 }}>{store.bannerUrl ? <img src={store.bannerUrl} alt="" /> : <UtensilsCrossed />}</div>
                      <div className="product-image-actions">
                        <label className="secondary product-image-upload">
                          <ImagePlus />{store.busy ? "Processando…" : store.bannerUrl ? "Trocar banner" : "Adicionar banner"}
                          <input type="file" accept="image/*" hidden disabled={store.busy} onChange={event => void handleStorefrontImage(establishment.id, "bannerUrl", event.target.files?.[0])} />
                        </label>
                        {store.bannerUrl && <button type="button" className="secondary" disabled={store.busy} onClick={() => setStorefrontDraft(establishment.id, { bannerUrl: null })}>Remover</button>}
                      </div>
                    </div>
                  </div>
                  <div className="settings-address-form" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
                    <label className="field"><span>Produto em destaque</span><select value={store.highlightProductId} onChange={event => setStorefrontDraft(establishment.id, { highlightProductId: event.target.value })}>
                      <option value="">Nenhum</option>
                      {catalogProducts.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select></label>
                    <label className="field"><span>Chamada de promoção</span><input value={store.highlightHeadline} maxLength={120} placeholder="Ex.: Burger do mês!" onChange={event => setStorefrontDraft(establishment.id, { highlightHeadline: event.target.value })} /></label>
                  </div>
                  <div className="settings-actions" style={{ marginTop: 10 }}>
                    <button type="button" className="primary" disabled={store.saving || store.busy} onClick={() => void saveStorefront(establishment.id)}>{store.saving ? "Salvando…" : "Salvar vitrine"}</button>
                    <button type="button" className="secondary" onClick={() => cancelEditStorefront(establishment.id, establishment)}>Cancelar</button>
                  </div>
                </div>;
              })()}
            </div>
          </article>;
        })}
      </div>
    </section> : null}

    {!loading && !error && rows.length === 0 ? <div className="empty"><span>Nenhum estabelecimento encontrado.</span></div> : null}
  </section>;
}
