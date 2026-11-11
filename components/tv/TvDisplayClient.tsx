"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Monitor, RefreshCw } from "lucide-react";
import type { TvState } from "@/lib/tv-model";
import { TvPlayer } from "./TvPlayer";
import { jsonRequest, TvRequestError, tvErrorMessage, tvRequest } from "./tv-client";
import styles from "./tv.module.css";

export function TvDisplayClient({ displayId, establishmentId }: { displayId?: string; establishmentId?: string }) {
  const [state, setState] = useState<TvState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const pairingToken = useRef<string | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const base = displayId ? `/api/tv/${encodeURIComponent(displayId)}` : "";
  const playlistUrl = displayId ? `${base}/playlist` : `/api/admin/tv?establishmentId=${encodeURIComponent(establishmentId || "")}`;

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      if (displayId && pairingToken.current) {
        await tvRequest(`${base}/session`, jsonRequest("POST", { token: pairingToken.current }));
        pairingToken.current = null;
        const clean = new URL(window.location.href); clean.hash = "";
        history.replaceState(null, "", clean.pathname + clean.search);
      }
      const payload = await tvRequest<TvState>(playlistUrl);
      if (!alive.current) return;
      setState(payload); setError(""); setDenied(false);
    } catch (cause) {
      if (!alive.current) return;
      const unauthorized = cause instanceof TvRequestError && [401, 403, 404, 410].includes(cause.status);
      if (unauthorized) { setState(null); setDenied(true); }
      setError(tvErrorMessage(cause));
    } finally {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    }
  }, [base, displayId, playlistUrl]);

  useEffect(() => {
    alive.current = true;
    if (displayId) pairingToken.current = new URLSearchParams(window.location.hash.slice(1)).get("token");
    queueMicrotask(() => void load());
    const timer = setInterval(() => void load(), 60000);
    const resume = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { alive.current = false; clearInterval(timer); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [displayId, load]);

  if (state) return <TvPlayer state={state} notice={error ? "Sem atualização no momento. A TV mantém a programação disponível e tenta novamente automaticamente." : ""}/>;
  return <main className={styles.gate}><div className={styles.gateCard}>{loading ? <Loader2 className={styles.spin} size={34}/> : denied ? <AlertCircle size={34}/> : <Monitor size={34}/>}<span className={styles.kicker}>MORDOMÊ TV</span><h1>{loading ? "Preparando a sua tela" : denied ? "Esta TV precisa de acesso" : "Não foi possível carregar a programação"}</h1><p>{loading ? "Buscando a programação desta unidade…" : error}</p>{!loading && <><p>{displayId ? "Abra o link gerado em Configurações → TV / Stories da loja. Se o acesso foi revogado, gere um novo link para esta TV." : "Entre no Mordomê com acesso às integrações da unidade para abrir a prévia."}</p><div className={styles.actions}><button type="button" className={styles.primaryButton} onClick={() => { setLoading(true); void load(); }}><RefreshCw size={16}/>Tentar novamente</button>{!displayId && <Link href="/" className={styles.secondaryButton}>Voltar ao Mordomê</Link>}</div></>}<small>Mordomê</small></div></main>;
}
