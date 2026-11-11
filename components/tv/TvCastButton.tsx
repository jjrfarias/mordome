"use client";

import { useEffect, useState } from "react";
import { Cast } from "lucide-react";
import { castPairingFromPath } from "@/lib/tv-cast";
import { loadCastSender, pairCastSession, type CastContext } from "./cast-sdk";
import { jsonRequest, tvRequest } from "./tv-client";
import styles from "./tv.module.css";

export function TvCastButton({ establishmentId, onChanged }: { establishmentId: string; onChanged: () => Promise<void> }) {
  const [context, setContext] = useState<CastContext | null>(null);
  const [notice, setNotice] = useState("Preparando transmissão…");
  const [busy, setBusy] = useState(false);
  const query = `?establishmentId=${encodeURIComponent(establishmentId)}`;
  useEffect(() => {
    let live = true;
    void tvRequest<{ applicationId: string | null }>(`/api/admin/tv/cast${query}`).then(async config => {
      if (!config.applicationId) { if (live) setNotice("Transmissão para TVs ainda em configuração. A prévia e os links continuam disponíveis."); return; }
      const sdk = await loadCastSender(config.applicationId);
      if (live) { setContext(sdk); setNotice("Use o Chrome no computador, conectado à mesma rede da TV."); }
    }).catch(() => { if (live) setNotice("Transmissão indisponível. Use o Chrome no computador e confira sua conexão."); });
    return () => { live = false; };
  }, [query]);

  async function transmit() {
    if (!context || busy) return;
    setBusy(true);
    let createdId: string | null = null;
    try {
      // Invoke synchronously from the click: the browser owns discovery and consent.
      await context.requestSession();
      const session = context.getCurrentSession();
      if (!session) throw new Error("Nenhuma TV foi selecionada.");
      const name = session.getCastDevice().friendlyName || "Google TV";
      const display = await tvRequest<{ id: string; urlPath: string }>(`/api/admin/tv/displays${query}`, jsonRequest("POST", { name: `Cast · ${name}`.slice(0, 80) }));
      createdId = display.id;
      await pairCastSession(session, castPairingFromPath(display.urlPath, crypto.randomUUID()));
      createdId = null;
      setNotice(`Programação recebida por ${name}. Para interromper, revogue o acesso em Telas da unidade ou use o controle da TV.`);
      await onChanged();
    } catch (error) {
      if (createdId) {
        try { await tvRequest(`/api/admin/tv/displays${query}`, jsonRequest("DELETE", { id: createdId })); }
        catch { /* The administrator can revoke the retained entry in the existing display list. */ }
      }
      setNotice(error instanceof Error ? error.message : "Transmissão não iniciada. Selecione uma TV na mesma rede e tente novamente.");
    } finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-label="Transmissão para Google TV"><button className={styles.primaryButton} disabled={!context || busy} onClick={() => void transmit()}><Cast size={18}/>{busy ? "Conectando à TV…" : "Transmitir para TV"}</button><p className={styles.smallNote} role="status">{notice}</p></section>;
}
