"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Maximize2, Monitor, Pause, Play, Repeat2, SkipBack, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import type { TvPlaylistItem, TvState } from "@/lib/tv-model";
import styles from "./tv.module.css";

type WakeLock = { release: () => Promise<void> };
type WakeNavigator = Navigator & { wakeLock?: { request: (kind: "screen") => Promise<WakeLock> } };

function InstagramIcon({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>;
}

function StoryMedia({ item, playing, muted, duration, next, fail, progress, onReady }: { item: TvPlaylistItem; playing: boolean; muted: boolean; duration: number; next: () => void; fail: (message: string) => void; progress: (value: number) => void; onReady: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const elapsed = useRef(0);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (ready) return;
    const timeout = setTimeout(() => fail("Um arquivo não carregou. A TV segue com os próximos e tentará novamente em instantes."), 20000);
    // Cached images may finish before their load listener is attached during hydration.
    if (item.type === "IMAGE" && imageRef.current?.complete && imageRef.current.naturalWidth > 0) queueMicrotask(() => setReady(true));
    return () => clearTimeout(timeout);
  }, [ready, item.type, fail]);

  useEffect(() => {
    if (item.type !== "IMAGE" || !ready || !playing) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const time = performance.now(); elapsed.current += time - previous; previous = time;
      progress(Math.min(100, elapsed.current / (duration * 10)));
      if (elapsed.current >= duration * 1000) { clearInterval(timer); next(); }
    }, 100);
    return () => clearInterval(timer);
  }, [duration, item.type, next, playing, progress, ready]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || item.type !== "VIDEO") return;
    let cancelled = false;
    video.muted = muted;
    if (!playing) video.pause();
    else video.play().then(() => { if (!cancelled) setBlocked(false); }).catch((cause: unknown) => {
      if (cancelled) return;
      if (cause instanceof DOMException && cause.name === "NotSupportedError") fail("Este navegador não reproduziu um vídeo. A programação continua com o próximo arquivo.");
      else setBlocked(true);
    });
    return () => { cancelled = true; };
  }, [item.type, muted, playing, fail]);

  useEffect(() => {
    if (item.type !== "VIDEO" || !playing || blocked) return;
    let position = -1; let lastAdvance = Date.now();
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.ended || document.hidden) { lastAdvance = Date.now(); return; }
      if (Math.abs(video.currentTime - position) > .05) { position = video.currentTime; lastAdvance = Date.now(); }
      else if (Date.now() - lastAdvance > 20000) fail("Um vídeo parou de responder. A TV continua com os próximos arquivos.");
    }, 3000);
    return () => clearInterval(timer);
  }, [blocked, fail, item.type, playing]);

  if (item.type === "IMAGE") return <img ref={imageRef} className={styles.storyMedia} src={item.url} alt={item.name} onLoad={() => { setReady(true); progress(0); onReady(); }} onError={() => fail("Uma imagem não pôde ser carregada. Tentaremos novamente em instantes.")} />;
  return <><video ref={videoRef} className={styles.storyMedia} src={item.url} poster={item.thumbnailUrl || undefined} muted={muted} autoPlay={playing} playsInline preload="auto" aria-label={item.name} onCanPlay={() => { setReady(true); onReady(); }} onEnded={next} onError={() => fail("Um vídeo não pôde ser carregado. Tentaremos novamente em instantes.")} onTimeUpdate={event => { const video = event.currentTarget; if (Number.isFinite(video.duration) && video.duration > 0) progress(video.currentTime / video.duration * 100); }} />{blocked && <button type="button" className={styles.startVideo} onClick={() => { void videoRef.current?.play().then(() => setBlocked(false)).catch(() => fail("O navegador não conseguiu iniciar este vídeo.")); }}><Play size={24} fill="currentColor" />Reproduzir vídeo</button>}</>;
}

export function TvPlayer({ state, embedded = false, notice = "" }: { state: TvState; embedded?: boolean; notice?: string }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cycle, setCycle] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mutedOverride, setMutedOverride] = useState<boolean | null>(null);
  const [progress, setProgress] = useState(0);
  const [now, setNow] = useState(0);
  const [failed, setFailed] = useState<Record<string, number>>({});
  const [mediaMessage, setMediaMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(true);
  const playerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackRef = useRef<{ items: TvPlaylistItem[]; index: number }>({ items: [], index: 0 });
  const fullscreen = !embedded || expanded;
  const muted = mutedOverride ?? state.settings.muted;
  const brandName = state.branding.name || state.establishment.name;
  const handle = (state.branding.instagramHandle || state.instagram.username || "").replace(/^@/, "");
  const duration = Math.min(60, Math.max(3, state.settings.imageDuration || 8));
  const available = useMemo(() => state.items.filter(item => item.enabled && (state.settings.source === "all" || item.source === state.settings.source) && (!item.expiresAt || new Date(item.expiresAt).getTime() > now) && (!failed[item.id] || failed[item.id] <= now)), [failed, now, state.items, state.settings.source]);
  const index = Math.max(0, available.findIndex(item => item.id === activeId));
  const current = available[index];

  useEffect(() => { playbackRef.current = { items: available, index }; }, [available, index]);
  useEffect(() => { if (current && activeId !== current.id) queueMicrotask(() => setActiveId(current.id)); }, [activeId, current]);
  useEffect(() => { queueMicrotask(() => setNow(Date.now())); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { queueMicrotask(() => setMutedOverride(null)); }, [state.settings.muted]);

  const advance = useCallback((direction = 1) => {
    const playback = playbackRef.current;
    if (!playback.items.length) return;
    const next = playback.items[(playback.index + direction + playback.items.length) % playback.items.length];
    setActiveId(next.id); setCycle(value => value + 1); setProgress(0);
  }, []);
  const next = useCallback(() => advance(1), [advance]);
  const onReady = useCallback(() => setMediaMessage(""), []);
  const fail = useCallback((message: string) => {
    if (!current) return;
    setFailed(previous => ({ ...previous, [current.id]: Date.now() + 120000 }));
    setMediaMessage(message); setProgress(0);
  }, [current]);
  const showControls = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 4500);
  }, []);

  const leaveFullscreen = useCallback(async () => {
    if (document.fullscreenElement) try { await document.exitFullscreen(); } catch { /* CSS mode still exits. */ }
    setExpanded(false); showControls();
  }, [showControls]);
  const enterFullscreen = useCallback(async () => {
    setExpanded(true); showControls();
    try { await playerRef.current?.requestFullscreen(); }
    catch { setMediaMessage("Modo de tela ampliada ativado. Use a tela cheia do navegador para ocultar suas barras."); }
  }, [showControls]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (embedded && !expanded && !playerRef.current?.contains(document.activeElement)) return;
      const target = event.target as HTMLElement | null;
      if (event.key === "Escape") { void leaveFullscreen(); return; }
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.key === "ArrowRight") { event.preventDefault(); advance(1); showControls(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); advance(-1); showControls(); }
      if (event.code === "Space" && target?.tagName !== "BUTTON" && target?.tagName !== "A") { event.preventDefault(); setPlaying(value => !value); showControls(); }
    };
    const changed = () => { if (!document.fullscreenElement) setExpanded(false); };
    window.addEventListener("keydown", handler); document.addEventListener("fullscreenchange", changed);
    return () => { window.removeEventListener("keydown", handler); document.removeEventListener("fullscreenchange", changed); };
  }, [advance, embedded, expanded, leaveFullscreen, showControls]);

  useEffect(() => {
    if (!fullscreen) return;
    let released = false; let sentinel: WakeLock | null = null;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || sentinel) return;
      try { const lock = await (navigator as WakeNavigator).wakeLock?.request("screen"); if (!lock) return; if (released) await lock.release(); else sentinel = lock; } catch { /* Unsupported wake lock does not block playback. */ }
    };
    const visibility = () => { sentinel = null; void acquire(); };
    void acquire(); document.addEventListener("visibilitychange", visibility);
    const timer = setTimeout(showControls, 0);
    return () => { released = true; clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); void sentinel?.release().catch(() => {}); };
  }, [fullscreen, showControls]);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const accent = /^#[0-9a-fA-F]{6}$/.test(state.branding.accentColor) ? state.branding.accentColor : "#d3ac67";
  const rgb = [1, 3, 5].map(offset => Number.parseInt(accent.slice(offset, offset + 2), 16));
  const accentInk = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 150 ? "#18251a" : "#fffefa";
  const brandStyle = { "--tv-accent": accent, "--tv-accent-ink": accentInk } as CSSProperties;
  return <div ref={playerRef} className={`${styles.player} ${fullscreen ? styles.immersive : ""} ${expanded ? styles.expanded : ""} ${state.settings.fit === "cover" ? styles.cover : ""}`} style={brandStyle} onMouseMove={showControls} onTouchStart={showControls}>
    <div className={styles.stage}>
      <aside className={styles.brandSide}><div className={styles.storeBrand}>{state.branding.logoUrl ? <img src={state.branding.logoUrl} alt={brandName} /> : <span className={styles.storeMonogram}>{brandName.slice(0, 1).toLocaleUpperCase("pt-BR")}</span>}<strong>{brandName}</strong></div><p className={styles.slogan}>{state.branding.slogan || "Seu momento merece algo especial."}</p><span className={styles.storeLocation}>{state.establishment.name}</span></aside>
      <div className={styles.storyFrame}>
        {current ? <><div className={styles.progress} aria-hidden="true">{available.slice(0, 50).map((item, position) => <span key={item.id}><i style={{ width: `${position < index ? 100 : position === index ? progress : 0}%` }} /></span>)}</div><StoryMedia key={`${current.id}:${current.url}:${cycle}`} item={current} playing={playing} muted={muted} duration={duration} next={next} fail={fail} progress={setProgress} onReady={onReady}/></> : <div className={styles.standby}><span>PROGRAMAÇÃO DA LOJA</span><strong>{brandName}</strong><p>{state.branding.slogan || "Que bom ter você aqui."}</p><small>Aguardando conteúdo para exibição</small></div>}
      </div>
      <aside className={styles.socialSide}>{handle ? <><InstagramIcon size={32}/><span>ACOMPANHE NOSSAS NOVIDADES</span><strong>@{handle}</strong><p>Siga, marque e compartilhe<br/>seu momento com a gente.</p></> : <><Monitor size={34}/><span>BEM-VINDO</span><strong>{brandName}</strong><p>{state.branding.slogan || "Fique à vontade. A casa é sua."}</p></>}<span className={styles.loopStamp}><i/>{current ? "EM LOOP" : "EM ESPERA"}</span></aside>
      {!fullscreen && <span className={styles.previewStamp}><Monitor size={12}/>PRÉVIA DA TV</span>}
    </div>
    <div className={`${styles.controls} ${fullscreen ? styles.floatingControls : ""} ${visible ? styles.controlsVisible : ""}`} onFocus={showControls}>
      <button type="button" onClick={() => advance(-1)} aria-label="Conteúdo anterior" disabled={!current}><SkipBack size={18}/></button><button type="button" className={styles.playButton} onClick={() => setPlaying(value => !value)} aria-label={playing ? "Pausar reprodução" : "Continuar reprodução"} disabled={!current}>{playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button><button type="button" onClick={next} aria-label="Próximo conteúdo" disabled={!current}><SkipForward size={18}/></button><span className={styles.counter}>{current ? index + 1 : 0} / {available.length}</span><span className={styles.loopLabel}><Repeat2 size={15}/>Loop contínuo</span><button type="button" className={styles.soundButton} onClick={() => setMutedOverride(!muted)} aria-label={muted ? "Ativar som" : "Silenciar"}>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>{expanded ? <button type="button" aria-label="Sair da tela cheia" onClick={() => void leaveFullscreen()}><X size={18}/></button> : <button type="button" aria-label="Tela cheia" onClick={() => void enterFullscreen()}><Maximize2 size={18}/></button>}
    </div>
    {(notice || mediaMessage) && <div role="status" className={`${styles.playerNotice} ${fullscreen && !visible ? styles.noticeHidden : ""}`}>{notice || mediaMessage}</div>}
    {fullscreen && !current && <span className={styles.standbyHelp}>Adicione fotos ou vídeos no painel da loja.</span>}
    <span className={styles.poweredBy}>Mordomê</span>
  </div>;
}
