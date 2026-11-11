"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, Loader2, ShieldCheck, Upload, X } from "lucide-react";
import { tvRequest, tvErrorMessage } from "./tv-client";
import styles from "./guest.module.css";

export function TvGuestUpload({ code, name, unit, logo, available }: { code: string; name: string; unit: string; logo: string | null; available: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  function select(list: FileList | null) {
    if (!list) return;
    setError(""); setSent(0);
    const chosen = Array.from(list);
    if (chosen.length > 5) { setError("Escolha até 5 arquivos por envio."); return; }
    if (chosen.some(file => !["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(file.type) || file.size > 30 * 1024 * 1024 || file.size === 0)) { setError("Use fotos JPG, PNG ou WebP e vídeos MP4 ou WebM, de até 30 MB cada."); return; }
    setFiles(chosen);
  }
  async function send() {
    if (lock.current || !consent || !files.length) return;
    lock.current = true; setBusy(true); setError(""); setSent(0);
    let count = 0;
    const remaining: File[] = [], failures: string[] = [];
    for (const [index, file] of files.entries()) {
      setProgress(`Enviando ${index + 1} de ${files.length}…`);
      try {
        await tvRequest(`/api/tv/guest/${code}`, { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name), "X-File-Size": String(file.size), "X-TV-Consent": "tv-guest-v1" }, body: file }, 120000);
        count++;
      } catch (cause) { remaining.push(file); failures.push(`${file.name}: ${tvErrorMessage(cause)}`); }
    }
    setFiles(remaining); setSent(count); setError(failures.join(" ")); setBusy(false); lock.current = false; setProgress("");
    if (input.current) input.current.value = "";
  }
  return <main className={styles.page}>
    <header className={styles.brand}>{logo ? <img src={logo} alt=""/> : <span>{name.slice(0,1)}</span>}<div><strong>{name}</strong><small>{unit}</small></div></header>
    <section className={styles.card}><span className={styles.eyebrow}>DE QUEM VIVE O MOMENTO</span><h1>Você também<br/>faz parte da tela.</h1><p className={styles.intro}>Compartilhe uma foto ou um vídeo da sua visita. Seu momento pode aparecer na TV da loja.</p>
      {!available ? <div className={styles.notice}><ShieldCheck/><h2>Uma pausa nos envios</h2><p>A loja não está recebendo novos arquivos agora. Tente novamente mais tarde.</p></div> : <>
        {sent > 0 && <div className={styles.success} role="status"><Check/><div><strong>{sent === 1 ? "Seu arquivo chegou!" : `${sent} arquivos recebidos!`}</strong><p>A equipe vai revisar antes de exibir na TV. Obrigado por participar.</p></div></div>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple hidden disabled={busy} onChange={event => select(event.target.files)}/>
        <button className={styles.drop} type="button" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={34}/><strong>Escolher fotos e vídeos</strong><span>Até 5 arquivos · 30 MB por arquivo</span></button>
        {files.length > 0 && <ul className={styles.files}>{files.map((file,index) => <li key={`${file.name}-${index}`}><div><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB</span></div><button disabled={busy} onClick={() => setFiles(files.filter((_,i) => i !== index))} aria-label={`Remover ${file.name}`}><X size={18}/></button></li>)}</ul>}
        <label className={styles.consent}><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)}/><span>Tenho autorização das pessoas que aparecem nos arquivos e autorizo esta loja a exibir esse conteúdo publicamente na TV. Posso pedir sua remoção à equipe da loja.</span></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.submit} disabled={busy || !consent || !files.length} onClick={() => void send()}>{busy ? <Loader2 className={styles.spin} size={20}/> : <Upload size={20}/>}<span aria-live="polite">{busy ? progress : "Enviar para a loja"}</span></button>
        <p className={styles.review}><ShieldCheck size={18}/>Tudo passa pela aprovação da equipe.</p>
      </>}
    </section><footer className={styles.footer}><a href="/privacidade" target="_blank" rel="noopener noreferrer">Privacidade</a> · <a href="/exclusao-de-dados" target="_blank" rel="noopener noreferrer">Exclusão de dados</a><br/>Uma lembrança boa merece ser compartilhada.<br/><strong>Mordomê</strong></footer>
  </main>;
}
