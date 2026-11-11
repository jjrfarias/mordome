"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "./tv.module.css";

export function TvPairingScreen() {
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/tv/pair", { cache: "no-store" });
        const data = await response.json();
        if (stopped) return;
        if ([401, 410].includes(response.status)) { setExpired(true); setError(data.error); return; }
        if (!response.ok) throw new Error(data.error);
        if (data.displayId) { window.location.replace(`/tv/${encodeURIComponent(data.displayId)}`); return; }
        setError("");
      } catch { if (!stopped) setError("Sem conexão. Tentando novamente…"); }
      if (!stopped) timer = setTimeout(poll, 3000);
    }
    async function start() {
      setCode(""); setQr(""); setError(""); setExpired(false);
      try {
        const response = await fetch("/api/tv/pair", { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const image = await QRCode.toDataURL(`${window.location.origin}/tv/ativar#code=${data.code}`, { width: 360, margin: 3, errorCorrectionLevel: "M" });
        if (stopped) return;
        setCode(data.code); setQr(image);
        timer = setTimeout(poll, 3000);
      } catch (cause) { if (!stopped) { setError(cause instanceof Error ? cause.message : "Não foi possível conectar."); setExpired(true); } }
    }
    // Delay issuance until after React's development effect replay.
    timer = setTimeout(start, 0);
    return () => { stopped = true; clearTimeout(timer); };
  }, [generation]);
  return <main className={styles.gate}><div className={styles.gateCard} style={{ maxWidth: 760 }}><span className={styles.kicker}>MORDOMÊ TV</span><h1>Ative esta tela pelo celular</h1><p>Leia o QR code com a câmera do celular. Entre no Mordomê, escolha a loja e confirme a ativação.</p>{qr && !expired && <img src={qr} width={280} height={280} alt="QR code para ativar esta TV" style={{ maxWidth: "100%", height: "auto", borderRadius: 12 }}/>}<h2 style={{ letterSpacing: 5, fontSize: 32 }}>{!expired && code ? `${code.slice(0, 5)} ${code.slice(5)}` : ""}</h2>{!code && !expired && <p>Preparando o código…</p>}{code && !expired && <p>O código vale por 10 minutos. A programação começa automaticamente após a confirmação.<br/>Você também pode digitar este código em TV / Stories → Ativar TV pelo código.</p>}{error && <p role="alert">{error}</p>}{expired && <button className={styles.primaryButton} onClick={() => setGeneration(value => value + 1)}>Gerar novo código</button>}<small>Mantenha esta página aberta e a TV conectada à internet.</small></div></main>;
}
