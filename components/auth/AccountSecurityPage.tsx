"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components/ui";
import styles from "./account-security.module.css";

type Mode = "forgot" | "reset" | "verify" | "account" | "invite";
const copy = {
  invite: { title: "Crie sua primeira senha.", text: "Ao aceitar o convite, você confirma seu e-mail e ativa seu acesso. Use de 8 a 128 caracteres, incluindo letra e número." },
  forgot: { title: "Esqueceu sua senha?", text: "Informe o e-mail confirmado da sua conta. Enviaremos um link para criar uma nova senha." },
  reset: { title: "Crie uma nova senha.", text: "Use de 8 a 128 caracteres, incluindo letra e número. Seus acessos anteriores serão encerrados." },
  verify: { title: "Confirme seu e-mail.", text: "Confirme apenas se você solicitou o cadastro deste e-mail na sua conta Mordomê." },
  account: { title: "Proteja sua conta.", text: "Seu e-mail será usado para recuperar a senha e receber avisos de segurança." },
};

export function AccountSecurityPage({ mode }: { mode: Mode }) {
  const [token, setToken] = useState("");
  const capturedToken = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState<{ email: string | null; emailVerifiedAt: string | null; pendingEmail: string | null } | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    function captureNewLink() {
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (!value) return;
      capturedToken.current = value;
      setToken(value); setError(""); setMessage("");
      window.history.replaceState(null, "", window.location.pathname);
    }
    window.addEventListener("hashchange", captureNewLink);
    return () => window.removeEventListener("hashchange", captureNewLink);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    capturedToken.current ??= new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    const linkToken = capturedToken.current;
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    queueMicrotask(async () => {
      setToken(linkToken);
      if (mode === "account") {
        try {
          const response = await fetch("/api/auth/email", { cache: "no-store", signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Não foi possível consultar sua conta.");
          if (!controller.signal.aborted) { setAccount(data); setEmail(data.pendingEmail ?? data.email ?? ""); }
        } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível conectar ao servidor."); }
      }
      if (!controller.signal.aborted) setReady(true);
    });
    return () => controller.abort();
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if ((mode === "reset" || mode === "invite") && form.get("password") !== form.get("confirmation")) { setError("As senhas não coincidem."); return; }
    setBusy(true); setError(""); setMessage("");
    const endpoint = { invite: "/api/auth/invite/accept", forgot: "/api/auth/password/forgot", reset: "/api/auth/password/reset", verify: "/api/auth/email/confirm", account: "/api/auth/email" }[mode];
    const body = mode === "verify" ? { token } : (mode === "reset" || mode === "invite") ? { token, password: form.get("password") } : { email, ...(mode === "account" ? { password: form.get("password") } : {}) };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir. Tente novamente.");
      setMessage(data.message);
      if ((mode === "reset" || mode === "invite") || mode === "verify") setToken("");
      const passwordInput = formElement.elements.namedItem("password");
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
      const confirmationInput = formElement.elements.namedItem("confirmation");
      if (confirmationInput instanceof HTMLInputElement) confirmationInput.value = "";
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível conectar ao servidor."); }
    finally { setBusy(false); }
  }

  const linkMode = (mode === "reset" || mode === "invite") || mode === "verify";
  const invalidLink = ready && linkMode && !/^[A-Za-z0-9_-]{43}$/.test(token) && !message;
  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="security-title">
      <Brand />
      <div className={styles.icon}><ShieldCheck aria-hidden="true" /></div>
      <span className={styles.eyebrow}>SEGURANÇA DA CONTA</span>
      <h1 id="security-title">{copy[mode].title}</h1>
      <p>{copy[mode].text}</p>
      {!ready && <p role="status">Verificando seu acesso…</p>}
      {account && <div className={styles.notice}>
        <strong>{account.emailVerifiedAt ? "E-mail confirmado" : "E-mail ainda não confirmado"}</strong>
        <span>{account.email ?? "Cadastre um endereço ao qual só você tenha acesso."}</span>
        {account.pendingEmail && <span>Confirmação pendente: {account.pendingEmail}</span>}
      </div>}
      {invalidLink && <div className={styles.error} role="alert">O link está incompleto. Abra novamente o link recebido por e-mail ou solicite outro.</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {message && <div className={styles.success} role="status">{message}</div>}
      {ready && !invalidLink && !(linkMode && message) && (mode !== "account" || account) && <form onSubmit={submit} className={styles.form}>
        {(mode === "forgot" || mode === "account") && <label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>}
        {((mode === "reset" || mode === "invite") || mode === "account") && <label>{mode === "account" ? "Senha atual" : "Nova senha"}<input name="password" type="password" autoComplete={mode === "account" ? "current-password" : "new-password"} required minLength={(mode === "reset" || mode === "invite") ? 8 : 1} maxLength={128} /></label>}
        {(mode === "reset" || mode === "invite") && <label>Confirmar nova senha<input name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></label>}
        <button className="primary wide" disabled={busy}>{busy ? "Aguarde…" : { invite: "Criar senha e aceitar convite", forgot: "Enviar link de recuperação", reset: "Salvar nova senha", verify: "Confirmar meu e-mail", account: "Enviar confirmação de e-mail" }[mode]}</button>
      </form>}
      {mode === "forgot" && <p className={styles.help}>Ainda não confirmou seu e-mail? Entre com sua senha e acesse “Segurança da conta”. Se perdeu o acesso, procure o administrador da sua empresa.</p>}
      {mode === "invite" && <p className={styles.help}>Se o link expirou, peça ao administrador da sua empresa para reenviar o convite.</p>}
      <nav className={styles.links} aria-label="Acesso à conta"><Link href="/">Voltar ao Mordomê</Link>{mode === "reset" && <Link href="/recuperar-senha">Solicitar outro link</Link>}{mode === "verify" && <Link href="/minha-conta">Cadastrar ou reenviar e-mail</Link>}</nav>
    </section>
  </main>;
}
