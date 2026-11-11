"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import { parseCastMessage, TV_CAST_NAMESPACE } from "@/lib/tv-cast";
import { TvDisplayClient } from "./TvDisplayClient";
import { jsonRequest, tvRequest } from "./tv-client";
import styles from "./tv.module.css";

type ReceiverContext = {
  addCustomMessageListener(namespace: string, listener: (event: { senderId: string; data: unknown }) => void): void;
  sendCustomMessage(namespace: string, senderId: string, data: unknown): void;
  start(options: { disableIdleTimeout: boolean; customNamespaces: Record<string, string> }): void;
};
type ReceiverWindow = Window & { cast?: { framework: { CastReceiverContext: { getInstance(): ReceiverContext } } } };

export function TvCastReceiver() {
  const started = useRef(false);
  const pairing = useRef(false);
  const [display, setDisplay] = useState<{ id: string; requestId: string } | null>(null);
  const [error, setError] = useState("");
  const initialize = useCallback(() => {
    if (started.current) return;
    try {
    const context = (window as ReceiverWindow).cast?.framework.CastReceiverContext.getInstance();
    if (!context) { setError("Abra esta tela pelo botão Transmitir para TV do Mordomê."); return; }
    started.current = true;
    context.addCustomMessageListener(TV_CAST_NAMESPACE, event => {
      const message = parseCastMessage(event.data);
      if (!message) return;
      const reply = (type: string) => {
        try { context.sendCustomMessage(TV_CAST_NAMESPACE, event.senderId, { type, requestId: message.requestId }); }
        catch { /* Sender may have disconnected; never log the pairing payload. */ }
      };
      if (pairing.current) { reply("ERROR"); return; }
      pairing.current = true;
      // Token is exchanged on the receiver's own origin, never placed in a URL or storage.
      void tvRequest(`/api/tv/${message.displayId}/session`, jsonRequest("POST", { token: message.token })).then(() => {
        setDisplay({ id: message.displayId, requestId: message.requestId }); setError(""); reply("PAIRED");
      }).catch(() => { setError("Acesso não autorizado. Transmita novamente pelo Mordomê."); reply("ERROR"); })
        .finally(() => { pairing.current = false; });
    });
    context.start({ disableIdleTimeout: true, customNamespaces: { [TV_CAST_NAMESPACE]: "JSON" } });
    } catch { setError("Abra esta tela pelo botão Transmitir para TV do Mordomê em uma Google TV compatível."); }
  }, []);
  return <><Script src="https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js" onReady={initialize} onError={() => setError("Não foi possível iniciar a transmissão. Tente novamente pelo Mordomê.")}/>{display ? <TvDisplayClient key={display.requestId} displayId={display.id}/> : <main className={styles.gate}><div className={styles.gateCard}><h1>Mordomê TV</h1><p>{error || "Aguardando a programação da loja…"}</p></div></main>}</>;
}
