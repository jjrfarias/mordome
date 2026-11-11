"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./tv.module.css";

type Session = { canManageIntegrations: boolean; establishment: { id: string }; establishments: { id: string; name: string }[] };
export function TvActivation() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("TV principal");
  const [unit, setUnit] = useState("");
  const [done, setDone] = useState(false);
  async function loadSession() {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (response.ok) { const data = await response.json(); setSession(data.session); setUnit(data.session.establishment.id); }
    else if (response.status !== 401) throw new Error("Não foi possível verificar seu acesso.");
  }
  useEffect(() => {
    queueMicrotask(() => {
      setCode((new URLSearchParams(window.location.hash.slice(1)).get("code") ?? "").replace(/[^A-Fa-f0-9]/g, "").toUpperCase().slice(0, 10));
      void loadSession().catch(() => setError("Não foi possível conectar. Tente novamente.")).finally(() => setLoading(false));
    });
  }, []);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await loadSession();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível entrar."); } finally { setBusy(false); }
  }
  async function activate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/tv/pair?establishmentId=${encodeURIComponent(unit)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDone(true); history.replaceState(null, "", "/tv/ativar");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível ativar."); } finally { setBusy(false); }
  }
  return <main className={styles.gate}><div className={styles.gateCard}><span className={styles.kicker}>MORDOMÊ TV</span><h1>{done ? "TV ativada!" : "Ativar uma TV"}</h1>{loading ? <p>Verificando seu acesso…</p> : done ? <p>A programação de <strong>{session?.establishments.find(item => item.id === unit)?.name}</strong> começará na TV em alguns segundos. Você já pode fechar esta página.</p> : !session ? <><p>Entre com seu usuário do Mordomê para escolher a loja desta TV.</p><form onSubmit={login} className={styles.pairForm}><label className={styles.field}>Usuário<input name="username" autoComplete="username" required/></label><label className={styles.field}>Senha<input name="password" type="password" autoComplete="current-password" required/></label><button className={styles.primaryButton} disabled={busy}>{busy ? "Entrando…" : "Entrar no Mordomê"}</button></form><Link href="/recuperar-senha">Esqueci minha senha</Link></> : !session.canManageIntegrations ? <p>Seu usuário não tem permissão para gerenciar TVs. Peça a um administrador da loja para ativar esta tela.</p> : <><p>Confira se o código abaixo é o mesmo que aparece na TV. Selecione a loja cuja programação será exibida.</p><form onSubmit={activate} className={styles.pairForm}><label className={styles.field}>Código da TV<input value={code} onChange={event => setCode(event.target.value.replace(/[^A-Fa-f0-9]/g, "").toUpperCase().slice(0, 10))} required minLength={10} maxLength={10} autoComplete="off"/></label><label className={styles.field}>Loja<select value={unit} onChange={event => setUnit(event.target.value)} required>{session.establishments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={styles.field}>Nome da TV<input value={name} onChange={event => setName(event.target.value)} required maxLength={80}/></label><button className={styles.primaryButton} disabled={busy || code.length !== 10 || !name.trim()}>{busy ? "Ativando…" : "Ativar transmissão nesta TV"}</button></form></>}{error && <p role="alert">{error}</p>}<Link href="/">Voltar ao Mordomê</Link></div></main>;
}
