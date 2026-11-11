"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, ArrowUpRight, Check, Copy, Film, Image as ImageIcon, Link as LinkIcon, Loader2, Monitor, Plus, RefreshCw, Settings2, Trash2, Upload, X } from "lucide-react";
import type { TvPlaylistItem, TvState } from "@/lib/tv-model";
import { TvRemotePreview } from "@/components/tv/TvRemotePreview";
import { jsonRequest, TvRequestError, tvErrorMessage, tvRequest } from "@/components/tv/tv-client";
import styles from "@/components/tv/tv.module.css";

type Draft = { brandName: string; slogan: string; instagramHandle: string; accentColor: string; imageDuration: number; fit: "contain" | "cover"; source: "all" | "instagram" | "upload"; muted: boolean };
const makeDraft = (state: TvState): Draft => ({ brandName: state.branding.name, slogan: state.branding.slogan, instagramHandle: state.branding.instagramHandle, accentColor: state.branding.accentColor, ...state.settings });

export function TvManagement({ establishmentId, establishmentName }: { establishmentId: string; establishmentName: string }) {
  const [state, setState] = useState<TvState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reviewItem, setReviewItem] = useState<TvPlaylistItem | null>(null);
  const [busy, setBusy] = useState("");
  const [displayName, setDisplayName] = useState("TV principal");
  const [newLink, setNewLink] = useState<{ id: string; name: string; url: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const uploadLock = useRef(false);
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
    const poll = setInterval(() => void load(), 15000), clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { invalidateLoads(); clearInterval(poll); clearInterval(clock); };
  }, [invalidateLoads, load]);


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

  async function reviewSubmission(item: TvPlaylistItem, approve: boolean) {
    if (!approve && !window.confirm(`Excluir o envio “${item.name}”?`)) return;
    setBusy(item.id); setError(""); setMessage("");
    try {
      await tvRequest(`/api/admin/tv/${approve ? "submissions" : "items"}${query}`, jsonRequest(approve ? "PATCH" : "DELETE", { id: item.id }));
      setReviewItem(null); await load(); setMessage(approve ? "Aprovado! O conteúdo entra no loop da TV em até um minuto." : "Envio excluído.");
    } catch (cause) { setError(tvErrorMessage(cause)); } finally { setBusy(""); }
  }
  async function toggleGuestUploads() {
    setBusy("guest"); setError("");
    try { await tvRequest(endpoint, jsonRequest("PATCH", { guestUploadsEnabled: !state?.guestUploads?.enabled })); await load(); }
    catch (cause) { setError(tvErrorMessage(cause)); } finally { setBusy(""); }
  }

  async function upload(files: FileList | File[] | null) {
    if (!files?.length || busy || uploadLock.current || !state?.storage.configured) return;
    uploadLock.current = true;
    const batch = Array.from(files);
    setBusy("upload"); setMessage(""); setError("");
    let count = 0; const failures: string[] = [];
    const accepted = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
    for (const [index, file] of batch.entries()) {
      setUploadProgress({ current: index + 1, total: batch.length, name: file.name });
      if (!accepted.has(file.type)) { failures.push(`${file.name}: use JPG, PNG, WebP, MP4 ou WebM.`); continue; }
      if (file.size > 30 * 1024 * 1024) { failures.push(`${file.name}: o limite é 30 MB por arquivo.`); continue; }
      try { await tvRequest(`/api/admin/tv/uploads${query}`, { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name), "X-File-Size": String(file.size) }, body: file }, 120000); count++; }
      catch (cause) { failures.push(`${file.name}: ${tvErrorMessage(cause)}`); }
    }
    if (fileRef.current) fileRef.current.value = "";
    if (count) { await load(); setMessage(`${count} ${count === 1 ? "arquivo adicionado" : "arquivos adicionados"} à programação.`); }
    if (failures.length) setError(failures.join(" "));
    setUploadProgress(null); uploadLock.current = false; setBusy("");
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
    <div className={styles.managementHeading}><div><span className={styles.kicker}>SUA LOJA. SEUS CLIENTES. UMA TELA.</span><h2>Momentos em cartaz</h2><p>Programação de <strong>{state.establishment.name}</strong>. Sua programação e os momentos dos clientes, juntos na TV.</p></div><div className={styles.actions}><a href={previewPath} target="_blank" rel="noopener noreferrer" className={styles.secondaryButton}><MaximizeIcon/>Abrir tela no computador</a><button type="button" className={styles.primaryButton} onClick={() => document.getElementById("tv-connect")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Monitor size={17}/>Conectar uma TV</button></div></div>
    {error && <div className={styles.error} role="alert"><AlertCircle size={18}/><span>{error}</span></div>}{message && <div className={styles.success} role="status"><Check size={17}/><span>{message}</span><button type="button" aria-label="Fechar aviso" onClick={() => setMessage("")}><X size={15}/></button></div>}
    <div className={styles.managementGrid}><div><div className={styles.previewHeading}><span>TELA DE EXIBIÇÃO</span><span>16:9 · Conteúdo sem cortes</span></div><TvRemotePreview key={establishmentId} state={state}/><p className={styles.previewHint}>{included} {included === 1 ? "conteúdo incluído" : "conteúdos incluídos"} · A programação recomeça automaticamente.</p></div><aside className={styles.integrationCard}><Upload size={24}/><h3>Envie vários arquivos de uma vez</h3><p>Selecione fotos e vídeos juntos ou arraste os arquivos para a programação abaixo.</p><button type="button" className={styles.primaryButton} disabled={Boolean(busy) || !state.storage.configured} onClick={() => fileRef.current?.click()}>Escolher fotos e vídeos</button><p>As fotos usam o tempo configurado. Os vídeos tocam até o final e a lista recomeça automaticamente.</p></aside></div>
    <section className={`${styles.panel} ${styles.guestPanel}`} id="tv-guests">
      <div className={styles.sectionHeading}><div><span className={styles.kicker}>PARTICIPAÇÃO DOS CLIENTES</span><h3>Da mesa para a tela <span className={styles.countBadge}>{state.submissions?.length || 0}</span></h3></div><button type="button" className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => void toggleGuestUploads()}>{state.guestUploads?.enabled ? "Pausar envios" : "Ativar envios"}</button></div>
      <p className={styles.panelDescription}>{state.guestUploads?.enabled ? "O QR Code aparece na TV. Os clientes enviam pelo celular, sem cadastro. Você decide o que vai ao ar." : "Envios pausados. Ative para mostrar o QR Code na TV e receber fotos e vídeos."}</p>
      <div className={styles.guestWorkflow}><span><b>01</b> Cliente escaneia</span><span><b>02</b> Você aprova</span><span><b>03</b> Aparece na TV</span>{state.guestUploads?.enabled && <a href={state.guestUploads.path} target="_blank" rel="noopener noreferrer">Abrir página de envio <ArrowUpRight size={15}/></a>}</div>
      {state.submissions?.length ? <div className={styles.reviewGrid}>{state.submissions.map(item => <article className={styles.reviewCard} key={item.id}><button type="button" className={styles.reviewThumbnail} onClick={() => setReviewItem(item)}>{item.type === "IMAGE" ? <img src={item.url} alt={item.name} loading="lazy"/> : <><Film size={32}/><span>Assistir ao vídeo</span></>}<span className={styles.pendingBadge}>Aguardando aprovação</span></button><div className={styles.reviewDetails}><strong>{item.name}</strong><small>{new Date(item.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small><button className={styles.secondaryButton} onClick={() => setReviewItem(item)}>Revisar conteúdo</button></div></article>)}</div> : <div className={styles.reviewEmpty}><ImageIcon size={26}/><div><strong>Tudo revisado por aqui.</strong><p>Os próximos envios dos clientes aparecem neste espaço. Nada vai para a TV sem sua aprovação.</p></div></div>}
    </section>
    {reviewItem && <div className={styles.overlay} onClick={() => setReviewItem(null)}><section className={`${styles.dialog} ${styles.reviewDialog}`} role="dialog" aria-modal="true" aria-label="Revisar envio do cliente" onClick={event => event.stopPropagation()}><button className={styles.closeButton} aria-label="Fechar revisão" onClick={() => setReviewItem(null)}><X/></button><span className={styles.kicker}>ANTES DE ENTRAR NO LOOP</span><h2>Esse momento pode ir ao ar?</h2><div className={styles.reviewMedia}>{reviewItem.type === "VIDEO" ? <video src={reviewItem.url} controls playsInline preload="metadata"/> : <img src={reviewItem.url} alt={reviewItem.name}/>}</div><p>{reviewItem.name}</p><p>Confira o conteúdo e as pessoas que aparecem antes de aprovar sua exibição pública.</p><div className={styles.actions}><button className={styles.primaryButton} disabled={Boolean(busy)} onClick={() => void reviewSubmission(reviewItem,true)}><Check size={18}/>Aprovar e exibir</button><button className={styles.secondaryButton} disabled={Boolean(busy)} onClick={() => void reviewSubmission(reviewItem,false)}><Trash2 size={18}/>Excluir envio</button></div></section></div>}
    <section className={styles.panel} id="tv-connect"><div className={styles.sectionHeading}><h3>Como colocar na TV</h3><Monitor size={22}/></div><div className={styles.connectionChoices}><div><h4>Computador conectado à TV</h4><p>Abra a tela abaixo, arraste a janela para a TV e use o botão de tela cheia.</p><a href={previewPath} target="_blank" rel="noopener noreferrer" className={styles.primaryButton}>Abrir tela no computador</a></div><div><h4>Pelo navegador da TV</h4><p>Na TV, digite <strong>mordome.jordaoconsultoria.com/tv</strong>. Leia o QR code com o celular e confirme a loja no Mordomê.</p><Link href="/tv/ativar" className={styles.secondaryButton}>Ativar TV pelo código</Link><p className={styles.smallNote}>Depois de ativada, basta abrir o mesmo endereço na TV. É necessário um navegador compatível e conexão à internet.</p></div></div></section>
    <div className={styles.managementColumns}><div className={styles.contentColumn}>
      <section className={styles.panel}><div className={styles.sectionHeading}><div><span className={styles.kicker}>A SEGUIR NA SUA TV</span><h3>Sua programação <span className={styles.countBadge}>{activeItems.length}</span></h3></div><button type="button" className={styles.secondaryButton} onClick={() => fileRef.current?.click()} disabled={Boolean(busy) || !state.storage.configured}>{busy === "upload" ? <Loader2 className={styles.spin} size={16}/> : <Plus size={16}/>}{busy === "upload" ? "Enviando…" : "Adicionar arquivos"}</button></div><div className={styles.playlistToolbar}><span>Arquivos enviados · Loop contínuo</span><button type="button" onClick={() => { setRefreshing(true); void load(); }} disabled={refreshing}><RefreshCw className={refreshing ? styles.spin : ""} size={13}/>{refreshing ? "Atualizando…" : checkedAt ? checkedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "Atualizar"}</button></div>
      {uploadProgress && <div className={styles.info} role="status" aria-live="polite"><Loader2 className={styles.spin} size={17}/><span>Enviando {uploadProgress.current} de {uploadProgress.total}: {uploadProgress.name}. Aguarde nesta tela até concluir.</span></div>}
      {!state.storage.configured && <div className={styles.info}><AlertCircle size={17}/><span>O envio de arquivos está aguardando a ativação do armazenamento desta loja.</span></div>}
      <div className={`${styles.mediaArea} ${dragging ? styles.dragging : ""}`} onDragOver={event => { event.preventDefault(); if (!busy && state.storage.configured) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}>
        {activeItems.length ? <div className={styles.mediaGrid}>{activeItems.map(item => <article className={`${styles.mediaCard} ${!item.enabled ? styles.disabledMedia : ""}`} key={item.id}><div className={styles.thumbnail}>{item.type === "IMAGE" ? <img src={item.thumbnailUrl || item.url} alt={item.name} loading="lazy"/> : item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.name} loading="lazy"/> : <Film size={30}/>}<span>{item.type === "VIDEO" ? <Film size={12}/> : <ImageIcon size={12}/ >}{item.type === "VIDEO" ? "Vídeo" : "Imagem"}</span></div><div className={styles.mediaName}><strong title={item.name}>{item.name}</strong><small>{item.guestSubmission ? "Cliente · aprovado pela equipe" : "Arquivo da loja"}</small></div><div className={styles.mediaActions}><label><input type="checkbox" checked={item.enabled} disabled={Boolean(busy)} onChange={() => void changeItem(item)}/><span>{item.enabled ? "Na programação" : "Desativado"}</span></label>{item.source === "upload" && <button type="button" aria-label={`Remover ${item.name}`} disabled={Boolean(busy)} onClick={() => void changeItem(item, true)}><Trash2 size={15}/></button>}</div></article>)}</div> : <div className={styles.emptyMedia}><Upload size={28}/><h4>A próxima atração é sua.</h4><p>Selecione várias fotos e vídeos da loja para começar.</p><button type="button" className={styles.textLink} onClick={() => fileRef.current?.click()} disabled={Boolean(busy) || !state.storage.configured}>Escolher arquivos<ArrowUpRight size={15}/></button></div>}{dragging && <div className={styles.dropOverlay}><Upload size={30}/>Solte os arquivos para adicionar à TV</div>}</div><p className={styles.smallNote}>JPG, PNG, WebP, MP4 e WebM · Até 30 MB por arquivo. Seleção múltipla e envio em lote. Até 100 arquivos ou 1 GB por loja.</p></section>
      <section className={styles.panel} id="tv-displays"><div className={styles.sectionHeading}><div><span className={styles.kicker}>TELAS DA UNIDADE</span><h3>TVs vinculadas</h3></div><Monitor size={22}/></div><p className={styles.panelDescription}>As TVs ativadas pelo QR code aparecem aqui. Você pode revogar o acesso a qualquer momento. Se preferir, também pode criar um link direto para esta loja.</p><form className={styles.displayForm} onSubmit={event => void createDisplay(event)}><label className={styles.field}>Nome da TV<input value={displayName} onChange={event => setDisplayName(event.target.value)} required minLength={2} maxLength={80} placeholder="Ex.: TV do balcão" disabled={Boolean(busy)}/></label><button className={styles.primaryButton} disabled={Boolean(busy) || displayName.trim().length < 2}>{busy === "display" ? <Loader2 className={styles.spin} size={16}/> : <LinkIcon size={16}/>}Criar link</button></form>
      {newLink && <div className={styles.newLink}><div><strong>Link de {newLink.name}</strong><button type="button" aria-label="Fechar link criado" onClick={() => setNewLink(null)}><X size={17}/></button></div><p>Copie agora. O link é mostrado apenas nesta criação e permite exibir a programação desta unidade.</p><input ref={linkRef} value={newLink.url} readOnly onFocus={event => event.target.select()} aria-label="Link de acesso da TV"/><div className={styles.actions}><button type="button" className={styles.primaryButton} onClick={() => void copyDisplayLink()}><Copy size={16}/>Copiar link</button><a href={newLink.url} target="_blank" rel="noopener noreferrer" className={styles.secondaryButton}>Abrir TV<ArrowUpRight size={16}/></a></div></div>}
      <div className={styles.displayList}>{state.displays?.length ? state.displays.map(display => <div key={display.id}><Monitor size={21}/><div><strong>{display.name}</strong><small>{display.lastSeenAt ? `Último acesso: ${new Date(display.lastSeenAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "Aguardando o primeiro acesso"}</small></div><button type="button" className={styles.dangerLink} disabled={Boolean(busy)} onClick={() => void revokeDisplay(display.id, display.name)}>Revogar</button></div>) : <p className={styles.smallNote}>Nenhuma TV vinculada. Você também pode usar a prévia com seu login.</p>}</div></section>
    </div>
    {draft && <form className={`${styles.panel} ${styles.settingsPanel}`} onSubmit={event => void saveSettings(event)}><div className={styles.sectionHeading}><div><span className={styles.kicker}>DO SEU JEITO</span><h3>Aparência e reprodução</h3></div><Settings2 size={21}/></div><label className={styles.field}>Nome na tela<input value={draft.brandName} onChange={event => setDraft({ ...draft, brandName: event.target.value })} required maxLength={100} disabled={Boolean(busy)}/></label><label className={styles.field}>Frase da loja<input value={draft.slogan} onChange={event => setDraft({ ...draft, slogan: event.target.value })} maxLength={160} placeholder="Uma frase que combina com sua loja" disabled={Boolean(busy)}/></label><label className={styles.field}>Instagram na tela<input value={draft.instagramHandle} onChange={event => setDraft({ ...draft, instagramHandle: event.target.value })} maxLength={50} placeholder="@sua_loja" disabled={Boolean(busy)}/></label><p className={styles.smallNote}>O @ é apenas exibido na tela; não conecta a conta.</p><label className={styles.colorField}><span>Cor de destaque</span><input type="color" value={draft.accentColor} onChange={event => setDraft({ ...draft, accentColor: event.target.value })} disabled={Boolean(busy)}/></label><div className={styles.fieldGrid}><label className={styles.field}>Tempo por foto<select value={draft.imageDuration} onChange={event => setDraft({ ...draft, imageDuration: Number(event.target.value) })} disabled={Boolean(busy)}>{[5, 8, 10, 15, 20, 30].map(value => <option key={value} value={value}>{value} segundos</option>)}</select></label><label className={styles.field}>Enquadramento<select value={draft.fit} onChange={event => setDraft({ ...draft, fit: event.target.value as Draft["fit"] })} disabled={Boolean(busy)}><option value="contain">Sem cortes</option><option value="cover">Preencher</option></select></label></div><label className={styles.checkboxField}><input type="checkbox" checked={draft.muted} onChange={event => setDraft({ ...draft, muted: event.target.checked })} disabled={Boolean(busy)}/><span>Iniciar vídeos sem som</span></label><p className={styles.smallNote}>{draft.fit === "cover" ? "Preencher pode cortar as bordas da imagem. " : ""}Vídeos tocam até o final. A logo vem da identidade visual da empresa.</p><button className={styles.primaryButton} disabled={Boolean(busy) || !dirty}>{busy === "settings" ? <Loader2 className={styles.spin} size={16}/> : <Check size={16}/>}Salvar configuração</button><small className={styles.smallNote}>As TVs recebem as mudanças em até um minuto.</small></form>}
    </div>
  </section>;
}

function MaximizeIcon() { return <ArrowUpRight size={17}/>; }
