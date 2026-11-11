"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowUpRight, Camera, Check, ChevronDown, Copy, Film, Image as ImageIcon, Link as LinkIcon, Loader2, Monitor, Plus, RefreshCw, Settings2, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import type { TvPlaylistItem, TvState } from "@/lib/tv-model";
import { TvPlayer } from "@/components/tv/TvPlayer";
import { TvCastButton } from "@/components/tv/TvCastButton";
import { jsonRequest, TvRequestError, tvErrorMessage, tvRequest } from "@/components/tv/tv-client";
import styles from "@/components/tv/tv.module.css";

type Draft = { brandName: string; slogan: string; instagramHandle: string; accentColor: string; imageDuration: number; fit: "contain" | "cover"; source: "all" | "instagram" | "upload"; muted: boolean };
const makeDraft = (state: TvState): Draft => ({ brandName: state.branding.name, slogan: state.branding.slogan, instagramHandle: state.branding.instagramHandle, accentColor: state.branding.accentColor, ...state.settings });

function InstagramConnection({ state, endpoint, onClose, onChanged }: { state: TvState; endpoint: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const [accessMode, setAccessMode] = useState<"unified" | "facebook">("unified");
  const [advanced, setAdvanced] = useState(false);
  const [token, setToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; username: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)");
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = overflow; previous?.focus(); };
  }, [busy, onClose]);

  async function connect(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await tvRequest(endpoint, jsonRequest("POST", { accessMode, accessToken: token.trim(), ...(accountId ? { accountId } : {}) }));
      setToken(""); await onChanged(); onClose();
    } catch (cause) {
      setError(tvErrorMessage(cause));
      if (cause instanceof TvRequestError && cause.accounts.length) setAccounts(cause.accounts);
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm("Desconectar o Instagram desta unidade? Os arquivos enviados continuarão disponíveis.")) return;
    setBusy(true); setError("");
    try { await tvRequest(endpoint, { method: "DELETE" }); await onChanged(); onClose(); }
    catch (cause) { setError(tvErrorMessage(cause)); } finally { setBusy(false); }
  }

  return <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="instagram-title"><button type="button" className={styles.closeButton} aria-label="Fechar conexão do Instagram" onClick={onClose} disabled={busy}><X size={20}/></button><div className={styles.dialogIcon}><Camera size={27}/></div><span className={styles.kicker}>INTEGRAÇÃO OFICIAL</span><h2 id="instagram-title">Do Instagram para a TV.</h2><p>Conecte a conta de <strong>{state.establishment.name}</strong>. Os stories ativos entram na programação e são atualizados a cada minuto enquanto a TV estiver aberta.</p>
    {state.instagram.connected && <div className={styles.success}><Check size={16}/>Conectado como @{state.instagram.username}</div>}
    <label className={styles.field}>Método de conexão<select value={accessMode} disabled={busy} onChange={event => { setAccessMode(event.target.value as "unified" | "facebook"); setToken(""); setAccountId(""); setAccounts([]); setError(""); }}><option value="unified">Sem Página do Facebook — login unificado</option><option value="facebook">Com Página do Facebook</option></select></label>
    <ol className={styles.connectionSteps}>{accessMode === "unified" ? <><li>Adicione a conta profissional do Instagram a um portfólio empresarial da Meta.</li><li>No aplicativo da Meta, configure <strong>API setup with Unified login</strong> e autorize a conta da loja.</li><li>Gere o token e cole no campo protegido. O acesso aos stories será validado antes de salvar.</li></> : <><li>Use uma conta profissional do Instagram vinculada a uma Página do Facebook.</li><li>Autorize a leitura dos stories no aplicativo da Meta.</li><li>Gere o token e salve o acesso abaixo para ativar a atualização automática.</li></>}</ol>
    <div className={styles.info}><ShieldCheck size={18}/><span>O token fica protegido no servidor. Ele não aparece na TV e não é salvo no navegador.</span></div>
    <button type="button" className={styles.advancedToggle} onClick={() => setAdvanced(value => !value)} aria-expanded={advanced}><Settings2 size={16}/>{state.instagram.connected ? "Atualizar acesso da Meta" : "Configurar acesso da Meta"}<ChevronDown size={16}/></button>
    {advanced && <form onSubmit={event => void connect(event)} className={styles.connectionForm}>{accessMode === "unified" ? <><p>No painel do aplicativo, use <strong>API setup with Unified login</strong>. A identificação da conta utiliza <code>instagram_basic</code> e <code>business_management</code>; habilite as permissões de leitura disponíveis para o app.</p><a className={styles.textLink} href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Abrir painel de aplicativos da Meta <ArrowUpRight size={15}/></a></> : <><p>Gere o token com <code>instagram_basic</code> e <code>pages_read_engagement</code>. Para encontrar a conta automaticamente, inclua <code>pages_show_list</code>.</p><a className={styles.textLink} href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">Abrir ferramentas da Meta <ArrowUpRight size={15}/></a></>}<label className={styles.field}>Token de acesso da Meta<input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="Cole o token gerado pela Meta" required minLength={15} disabled={busy}/></label>{accounts.length ? <label className={styles.field}>Conta do Instagram<select value={accountId} onChange={event => setAccountId(event.target.value)} required disabled={busy}><option value="">Selecione a conta da unidade</option>{accounts.map(account => <option key={account.id} value={account.id}>@{account.username}</option>)}</select></label> : <label className={styles.field}>ID do Instagram <small>opcional</small><input inputMode="numeric" pattern="[0-9]*" value={accountId} onChange={event => setAccountId(event.target.value.replace(/\D/g, ""))} placeholder="Localizar automaticamente" disabled={busy}/></label>}<p>O ID é numérico e diferente do @. Se o token expirar, atualize a conexão aqui.</p><button className={styles.primaryButton} disabled={busy || !token.trim()}>{busy ? <Loader2 className={styles.spin} size={17}/> : <Camera size={17}/>}Validar e conectar</button></form>}
    {error && <div className={styles.error} role="alert"><AlertCircle size={17}/><span>{error}</span></div>}<p className={styles.smallNote}>A conexão exige configurar o aplicativo e autorizar a conta na Meta. A configuração técnica usa uma conta de desenvolvedor Meta. Informar apenas o @ não autoriza o acesso aos stories.</p>{state.instagram.connected && <button type="button" className={styles.dangerLink} onClick={() => void disconnect()} disabled={busy}>Desconectar Instagram</button>}
  </div></div>;
}

export function TvManagement({ establishmentId, establishmentName }: { establishmentId: string; establishmentName: string }) {
  const [state, setState] = useState<TvState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [displayName, setDisplayName] = useState("TV principal");
  const [newLink, setNewLink] = useState<{ id: string; name: string; url: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(0);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const sequence = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const query = `?establishmentId=${encodeURIComponent(establishmentId)}`;
  const endpoint = `/api/admin/tv${query}`;
  const previewPath = `/tv${query}`;

  const load = useCallback(async (updateForm = false) => {
    const request = ++sequence.current;
    try {
      const payload = await tvRequest<TvState>(endpoint);
      if (request !== sequence.current) return;
      setState(payload); setCheckedAt(new Date()); setError("");
      if (updateForm) setDraft(makeDraft(payload));
    } catch (cause) {
      if (request !== sequence.current) return;
      if (cause instanceof TvRequestError && [401, 403, 404, 410].includes(cause.status)) setState(null);
      setError(tvErrorMessage(cause));
    } finally { if (request === sequence.current) { setLoading(false); setRefreshing(false); } }
  }, [endpoint]);

  const invalidateLoads = useCallback(() => { sequence.current++; }, []);
  useEffect(() => {
    queueMicrotask(() => { setNow(Date.now()); void load(true); });
    const poll = setInterval(() => void load(), 60000), clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { invalidateLoads(); clearInterval(poll); clearInterval(clock); };
  }, [invalidateLoads, load]);

  const closeConnection = useCallback(() => setConnectionOpen(false), []);
  const connectionChanged = useCallback(async () => { await load(); setMessage("Conexão do Instagram atualizada."); }, [load]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault(); if (!draft) return; setBusy("settings"); setError(""); setMessage("");
    try { await tvRequest(endpoint, jsonRequest("PATCH", draft)); await load(true); setMessage("Programação salva. As TVs recebem a atualização em até um minuto."); }
    catch (cause) { setError(tvErrorMessage(cause)); } finally { setBusy(""); }
  }

  async function changeItem(item: TvPlaylistItem, remove = false) {
    if (remove && !window.confirm(`Remover “${item.name}” da programação desta unidade?`)) return;
    setBusy(item.id); setError(""); setMessage("");
    try { await tvRequest(`/api/admin/tv/items${query}`, jsonRequest(remove ? "DELETE" : "PATCH", remove ? { id: item.id } : { id: item.id, enabled: !item.enabled })); await load(); setMessage(remove ? "Arquivo removido." : "Programação atualizada."); }
    catch (cause) { setError(tvErrorMessage(cause)); } finally { setBusy(""); }
  }

  async function upload(files: FileList | File[] | null) {
    if (!files?.length || busy || !state?.storage.configured) return;
    setBusy("upload"); setMessage(""); setError("");
    let count = 0; const failures: string[] = [];
    const accepted = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
    for (const file of Array.from(files)) {
      if (!accepted.has(file.type)) { failures.push(`${file.name}: use JPG, PNG, WebP, MP4 ou WebM.`); continue; }
      if (file.size > 30 * 1024 * 1024) { failures.push(`${file.name}: o limite é 30 MB por arquivo.`); continue; }
      try { await tvRequest(`/api/admin/tv/uploads${query}`, { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name), "X-File-Size": String(file.size) }, body: file }, 120000); count++; }
      catch (cause) { failures.push(`${file.name}: ${tvErrorMessage(cause)}`); }
    }
    if (fileRef.current) fileRef.current.value = "";
    if (count) { await load(); setMessage(`${count} ${count === 1 ? "arquivo adicionado" : "arquivos adicionados"} à programação.`); }
    if (failures.length) setError(failures.join(" "));
    setBusy("");
  }

  async function createDisplay(event: FormEvent) {
    event.preventDefault(); setBusy("display"); setError(""); setMessage(""); setNewLink(null);
    try { const result = await tvRequest<{ id: string; name: string; urlPath: string }>(`/api/admin/tv/displays${query}`, jsonRequest("POST", { name: displayName.trim() })); setNewLink({ id: result.id, name: result.name, url: new URL(result.urlPath, window.location.origin).toString() }); await load(); }
    catch (cause) { setError(tvErrorMessage(cause)); } finally { setBusy(""); }
  }

  async function revokeDisplay(id: string, name: string) {
    if (!window.confirm(`Revogar o acesso de “${name}”? A TV será desconectada.`)) return;
    setBusy(id); setError(""); setMessage("");
    try { await tvRequest(`/api/admin/tv/displays${query}`, jsonRequest("DELETE", { id })); if (newLink?.id === id) setNewLink(null); await load(); setMessage("Acesso da TV revogado."); }
    catch (cause) { setError(tvErrorMessage(cause)); } finally { setBusy(""); }
  }

  async function copyDisplayLink() {
    if (!newLink) return;
    try { await navigator.clipboard.writeText(newLink.url); setMessage("Link copiado. Abra esse endereço no navegador da TV."); }
    catch { linkRef.current?.focus(); linkRef.current?.select(); setMessage("Selecione e copie o link exibido abaixo."); }
  }

  if (loading) return <section className={styles.management}><div className={styles.loading}><Loader2 className={styles.spin} size={26}/><p>Carregando a programação de {establishmentName}…</p></div></section>;
  if (!state) return <section className={styles.management}><div className={styles.error} role="alert"><AlertCircle size={18}/><span>{error || "Não foi possível carregar a configuração da TV."}</span></div><button className={styles.secondaryButton} onClick={() => void load(true)}><RefreshCw size={16}/>Tentar novamente</button></section>;
  const activeItems = state.items.filter(item => !item.expiresAt || new Date(item.expiresAt).getTime() > now);
  const included = activeItems.filter(item => item.enabled && (state.settings.source === "all" || item.source === state.settings.source)).length;
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(makeDraft(state));

  return <section className={styles.management}>
    <input className={styles.hiddenInput} ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple onChange={event => void upload(event.target.files)} aria-label="Escolher fotos e vídeos para a TV"/>
    <div className={styles.managementHeading}><div><span className={styles.kicker}>SEU CONTEÚDO, EM CARTAZ</span><h2>TV / Stories</h2><p>Programação de <strong>{state.establishment.name}</strong>. Stories, fotos e vídeos em loop.</p></div><div className={styles.actions}><a href={previewPath} target="_blank" rel="noopener noreferrer" className={styles.secondaryButton}><MaximizeIcon/>Abrir prévia</a><button type="button" className={styles.primaryButton} onClick={() => document.getElementById("tv-displays")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Monitor size={17}/>Conectar uma TV</button></div></div>
    {error && <div className={styles.error} role="alert"><AlertCircle size={18}/><span>{error}</span></div>}{message && <div className={styles.success} role="status"><Check size={17}/><span>{message}</span><button type="button" aria-label="Fechar aviso" onClick={() => setMessage("")}><X size={15}/></button></div>}
    <div className={styles.managementGrid}><div><div className={styles.previewHeading}><span>TELA DE EXIBIÇÃO</span><span>16:9 · Conteúdo sem cortes</span></div><TvPlayer state={state} embedded/><p className={styles.previewHint}>{included} {included === 1 ? "conteúdo incluído" : "conteúdos incluídos"} · A programação recomeça automaticamente.</p></div><aside className={styles.integrationCard}><div className={styles.integrationTop}><Camera size={24}/><span className={state.instagram.connected && !state.instagram.error ? styles.connectedBadge : styles.badge}>{state.instagram.connected ? state.instagram.error ? "Verificar acesso" : "Conectado" : "Não conectado"}</span></div><h3>Instagram da unidade</h3><p>{state.instagram.username ? `@${state.instagram.username}` : "Conecte a conta da loja para exibir seus stories."}</p><button type="button" className={styles.secondaryButton} onClick={() => setConnectionOpen(true)}><Camera size={16}/>{state.instagram.connected ? "Gerenciar conexão" : "Conectar Instagram"}<ArrowUpRight size={15}/></button><small><RefreshCw size={12}/>Atualização automática a cada minuto</small>{state.instagram.error && <div className={styles.inlineError}>{state.instagram.error}</div>}</aside></div>
    <TvCastButton establishmentId={establishmentId} onChanged={load}/>
    <div className={styles.managementColumns}><div className={styles.contentColumn}>
      <section className={styles.panel}><div className={styles.sectionHeading}><div><span className={styles.kicker}>A SEGUIR NA SUA TV</span><h3>Sua programação <span className={styles.countBadge}>{activeItems.length}</span></h3></div><button type="button" className={styles.secondaryButton} onClick={() => fileRef.current?.click()} disabled={Boolean(busy) || !state.storage.configured}>{busy === "upload" ? <Loader2 className={styles.spin} size={16}/> : <Plus size={16}/>}{busy === "upload" ? "Enviando…" : "Adicionar arquivos"}</button></div><div className={styles.playlistToolbar}><span>{state.settings.source === "all" ? "Instagram e arquivos enviados" : state.settings.source === "instagram" ? "Exibindo apenas Instagram" : "Exibindo apenas arquivos enviados"}</span><button type="button" onClick={() => { setRefreshing(true); void load(); }} disabled={refreshing}><RefreshCw className={refreshing ? styles.spin : ""} size={13}/>{refreshing ? "Atualizando…" : checkedAt ? checkedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "Atualizar"}</button></div>
      {!state.storage.configured && <div className={styles.info}><AlertCircle size={17}/><span>O envio de arquivos está aguardando a ativação do armazenamento desta loja.</span></div>}
      <div className={`${styles.mediaArea} ${dragging ? styles.dragging : ""}`} onDragOver={event => { event.preventDefault(); if (!busy && state.storage.configured) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}>
        {activeItems.length ? <div className={styles.mediaGrid}>{activeItems.map(item => <article className={`${styles.mediaCard} ${!item.enabled ? styles.disabledMedia : ""}`} key={item.id}><div className={styles.thumbnail}>{item.type === "IMAGE" ? <img src={item.thumbnailUrl || item.url} alt={item.name} loading="lazy"/> : item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.name} loading="lazy"/> : <Film size={30}/>}<span>{item.type === "VIDEO" ? <Film size={12}/> : <ImageIcon size={12}/ >}{item.type === "VIDEO" ? "Vídeo" : "Imagem"}</span></div><div className={styles.mediaName}><strong title={item.name}>{item.name}</strong><small>{item.source === "instagram" ? "Instagram · story ativo" : "Arquivo enviado"}</small></div><div className={styles.mediaActions}><label><input type="checkbox" checked={item.enabled} disabled={Boolean(busy)} onChange={() => void changeItem(item)}/><span>{item.enabled ? "Na programação" : "Desativado"}</span></label>{item.source === "upload" && <button type="button" aria-label={`Remover ${item.name}`} disabled={Boolean(busy)} onClick={() => void changeItem(item, true)}><Trash2 size={15}/></button>}</div></article>)}</div> : <div className={styles.emptyMedia}><Upload size={28}/><h4>A próxima atração é sua.</h4><p>Adicione fotos e vídeos da loja ou conecte o Instagram para começar.</p><button type="button" className={styles.textLink} onClick={() => fileRef.current?.click()} disabled={Boolean(busy) || !state.storage.configured}>Escolher arquivos<ArrowUpRight size={15}/></button></div>}{dragging && <div className={styles.dropOverlay}><Upload size={30}/>Solte os arquivos para adicionar à TV</div>}</div><p className={styles.smallNote}>JPG, PNG, WebP, MP4 e WebM · Até 30 MB por arquivo. Stories expirados saem automaticamente.</p></section>
      <section className={styles.panel} id="tv-displays"><div className={styles.sectionHeading}><div><span className={styles.kicker}>TELAS DA UNIDADE</span><h3>Conectar uma TV</h3></div><Monitor size={22}/></div><p className={styles.panelDescription}>Crie um link para abrir no navegador da TV. Ela exibe somente a programação desta unidade, sem acesso ao painel de administração.</p><form className={styles.displayForm} onSubmit={event => void createDisplay(event)}><label className={styles.field}>Nome da TV<input value={displayName} onChange={event => setDisplayName(event.target.value)} required minLength={2} maxLength={80} placeholder="Ex.: TV do balcão" disabled={Boolean(busy)}/></label><button className={styles.primaryButton} disabled={Boolean(busy) || displayName.trim().length < 2}>{busy === "display" ? <Loader2 className={styles.spin} size={16}/> : <LinkIcon size={16}/>}Criar link</button></form>
      {newLink && <div className={styles.newLink}><div><strong>Link de {newLink.name}</strong><button type="button" aria-label="Fechar link criado" onClick={() => setNewLink(null)}><X size={17}/></button></div><p>Copie agora. O link é mostrado apenas nesta criação e permite exibir a programação desta unidade.</p><input ref={linkRef} value={newLink.url} readOnly onFocus={event => event.target.select()} aria-label="Link de acesso da TV"/><div className={styles.actions}><button type="button" className={styles.primaryButton} onClick={() => void copyDisplayLink()}><Copy size={16}/>Copiar link</button><a href={newLink.url} target="_blank" rel="noopener noreferrer" className={styles.secondaryButton}>Abrir TV<ArrowUpRight size={16}/></a></div></div>}
      <div className={styles.displayList}>{state.displays?.length ? state.displays.map(display => <div key={display.id}><Monitor size={21}/><div><strong>{display.name}</strong><small>{display.lastSeenAt ? `Último acesso: ${new Date(display.lastSeenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "Aguardando o primeiro acesso"}</small></div><button type="button" className={styles.dangerLink} disabled={Boolean(busy)} onClick={() => void revokeDisplay(display.id, display.name)}>Revogar</button></div>) : <p className={styles.smallNote}>Nenhuma TV vinculada. Você também pode usar a prévia com seu login.</p>}</div></section>
    </div>
    {draft && <form className={`${styles.panel} ${styles.settingsPanel}`} onSubmit={event => void saveSettings(event)}><div className={styles.sectionHeading}><div><span className={styles.kicker}>DO SEU JEITO</span><h3>Aparência e reprodução</h3></div><Settings2 size={21}/></div><label className={styles.field}>Nome na tela<input value={draft.brandName} onChange={event => setDraft({ ...draft, brandName: event.target.value })} required maxLength={100} disabled={Boolean(busy)}/></label><label className={styles.field}>Frase da loja<input value={draft.slogan} onChange={event => setDraft({ ...draft, slogan: event.target.value })} maxLength={160} placeholder="Uma frase que combina com sua loja" disabled={Boolean(busy)}/></label><label className={styles.field}>Instagram na tela<input value={draft.instagramHandle} onChange={event => setDraft({ ...draft, instagramHandle: event.target.value })} maxLength={50} placeholder="@sua_loja" disabled={Boolean(busy)}/></label><p className={styles.smallNote}>O @ é exibido na tela. A conexão para buscar stories é feita em Instagram da unidade.</p><label className={styles.colorField}><span>Cor de destaque</span><input type="color" value={draft.accentColor} onChange={event => setDraft({ ...draft, accentColor: event.target.value })} disabled={Boolean(busy)}/></label><div className={styles.fieldGrid}><label className={styles.field}>Tempo por foto<select value={draft.imageDuration} onChange={event => setDraft({ ...draft, imageDuration: Number(event.target.value) })} disabled={Boolean(busy)}>{[5, 8, 10, 15, 20, 30].map(value => <option key={value} value={value}>{value} segundos</option>)}</select></label><label className={styles.field}>Enquadramento<select value={draft.fit} onChange={event => setDraft({ ...draft, fit: event.target.value as Draft["fit"] })} disabled={Boolean(busy)}><option value="contain">Sem cortes</option><option value="cover">Preencher</option></select></label></div><label className={styles.field}>Conteúdo a exibir<select value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value as Draft["source"] })} disabled={Boolean(busy)}><option value="all">Instagram e arquivos enviados</option><option value="instagram">Somente Instagram</option><option value="upload">Somente arquivos enviados</option></select></label><label className={styles.checkboxField}><input type="checkbox" checked={draft.muted} onChange={event => setDraft({ ...draft, muted: event.target.checked })} disabled={Boolean(busy)}/><span>Iniciar vídeos sem som</span></label><p className={styles.smallNote}>{draft.fit === "cover" ? "Preencher pode cortar as bordas da imagem. " : ""}Vídeos tocam até o final. A logo vem da identidade visual da empresa.</p><button className={styles.primaryButton} disabled={Boolean(busy) || !dirty}>{busy === "settings" ? <Loader2 className={styles.spin} size={16}/> : <Check size={16}/>}Salvar configuração</button><small className={styles.smallNote}>As TVs recebem as mudanças em até um minuto.</small></form>}
    </div>{connectionOpen && <InstagramConnection state={state} endpoint={`/api/admin/tv/instagram${query}`} onClose={closeConnection} onChanged={connectionChanged}/>}
  </section>;
}

function MaximizeIcon() { return <ArrowUpRight size={17}/>; }
