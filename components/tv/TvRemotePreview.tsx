"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import type { TvState } from "@/lib/tv-model";
import type { TvRemoteAction, TvRemoteStatus } from "@/lib/tv-remote-model";
import { TvPlayer } from "./TvPlayer";
import { jsonRequest, tvRequest, tvErrorMessage } from "./tv-client";
import styles from "./tv.module.css";

export function TvRemotePreview({ state }: { state: TvState }) {
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState<TvRemoteStatus | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [volume, setVolume] = useState(100);
  const [now, setNow] = useState(0);
  const generation = useRef(0);
  const sendingRef = useRef(false);
  const validSelection = state.displays?.some(display => display.id === selected) ? selected : "";
  const endpoint = `/api/admin/tv/remote?establishmentId=${encodeURIComponent(state.establishment.id)}&displayId=${encodeURIComponent(validSelection)}`;
  useEffect(() => {
    const current = ++generation.current;
    let stopped = false; let first = true; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!validSelection) return;
      try {
        if (!sendingRef.current) {
          const payload = await tvRequest<TvRemoteStatus>(endpoint);
          if (!stopped && generation.current === current && !sendingRef.current) {
            setStatus(previous => previous && previous.control.version > payload.control.version ? { ...payload, control: previous.control } : payload); setNow(Date.now()); setError("");
            if (first) { setVolume(Math.round(payload.control.volume * 100)); first = false; }
          }
        }
      } catch (cause) { if (!stopped) setError(tvErrorMessage(cause)); }
      if (!stopped) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [endpoint, validSelection]);
  const online = !!status?.reportedAt && now - Date.parse(status.reportedAt) < 12000;
  const confirmed = status && status.report && status.report.appliedVersion >= status.control.version;
  const actual = state.items.find(item => item.id === status?.report?.itemId);
  async function send(action: TvRemoteAction) {
    if (!validSelection || sendingRef.current) return;
    const current = generation.current;
    sendingRef.current = true; setSending(true); setError("");
    try {
      const result = await tvRequest<{control: TvRemoteStatus["control"]}>(endpoint, jsonRequest("POST", action));
      if (generation.current === current) setStatus(previous => previous ? { ...previous, control: result.control } : null);
    } catch (cause) { if (generation.current === current) setError(tvErrorMessage(cause)); }
    finally { sendingRef.current = false; setSending(false); }
  }
  const playing = status?.control.playing ?? true;
  const muted = status?.control.muted ?? state.settings.muted;
  return <div className={styles.remotePreview}>
    <div className={styles.remoteHeading}><label><Monitor size={17}/><span>Controlar</span><select aria-label="Escolher TV para controlar" value={validSelection} disabled={sending} onChange={event => { setSelected(event.target.value); setStatus(null); setError(""); setVolume(100); }}>{<option value="">Só a prévia neste aparelho</option>}{state.displays?.map(display => <option key={display.id} value={display.id}>{display.name}</option>)}</select></label>{validSelection && <span className={`${styles.remoteBadge} ${online ? styles.remoteOnline : ""}`}>{error ? "Sem comunicação" : online ? "TV conectada" : "Aguardando TV"}</span>}</div>
    {validSelection ? <>
      <TvPlayer key={`${validSelection}:${status?.report?.itemId || "waiting"}`} state={state} embedded hideControls remote={{ version: Date.parse(status?.reportedAt || "") || 0, navigationVersion: 1, itemId: status?.report?.itemId || null, playing: status?.report?.playing ?? false, muted: true, volume: 0 }}/>
      <div className={styles.remoteToolbar}><button aria-label="Conteúdo anterior na TV" disabled={sending || !status || !state.items.some(item => item.enabled)} onClick={() => void send({ action: "previous" })}><SkipBack size={20}/></button><button className={styles.remotePlay} aria-label={playing ? "Pausar TV" : "Continuar TV"} disabled={sending || !status} onClick={() => void send({ action: "play", value: !playing })}>{playing ? <Pause size={21}/> : <Play size={21}/>}</button><button aria-label="Próximo conteúdo na TV" disabled={sending || !status || !state.items.some(item => item.enabled)} onClick={() => void send({ action: "next" })}><SkipForward size={20}/></button><span className={styles.remoteDivider}/><button aria-label={muted ? "Ativar som na TV" : "Silenciar TV"} disabled={sending || !status} onClick={() => void send({ action: "mute", value: !muted })}>{muted ? <VolumeX size={20}/> : <Volume2 size={20}/>}</button><label className={styles.remoteVolume}>Volume<input type="range" min="0" max="100" step="5" value={volume} disabled={sending || !status} onChange={event => setVolume(Number(event.target.value))}/><output>{volume}%</output></label><button className={styles.remoteApply} disabled={sending || !status} onClick={() => void send({ action: "volume", value: volume / 100 })}>Aplicar</button></div>
      <div className={styles.remoteStatus} role="status"><strong>{sending ? "Enviando comando…" : error || (!status ? "Conectando…" : !online ? "Abra o link desta TV para receber os comandos." : !confirmed ? "Comando enviado. Aguardando confirmação da TV…" : status.report?.playing ? "Reproduzindo na TV" : "TV pausada")}</strong><span>{actual ? actual.name : "Aguardando informação do conteúdo"}</span></div>
      {status?.report?.audioBlocked && <p className={styles.remoteWarning}>O navegador da TV bloqueou o som. Toque uma vez em “Liberar o som” na própria TV. Os vídeos continuam sem som até essa liberação.</p>}
      <p className={styles.previewHint}>Comandos em poucos segundos. A prévia mostra o conteúdo informado pela TV, sem som; não é um espelhamento exato. Para tela cheia, dê dois cliques na própria tela da TV ou use F11 no computador.</p>
    </> : <><TvPlayer state={state} embedded/><p className={styles.previewHint}>Selecione uma TV vinculada acima para comandá-la. Nesta opção, os botões controlam apenas a prévia.</p></>}
  </div>;
}
