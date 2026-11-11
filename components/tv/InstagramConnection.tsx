"use client";

import { useState } from "react";
import Link from "next/link";
import type { TvState } from "@/lib/tv-model";
import styles from "./tv.module.css";

export function InstagramConnection({ initialState, accounts: initialAccounts, allowAccountId: initialAllowAccountId = false, result }: { initialState: TvState; accounts: { id: string; username: string }[]; allowAccountId?: boolean; result: string }) {
  const [state, setState] = useState(initialState);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [allowAccountId, setAllowAccountId] = useState(initialAllowAccountId);
  const [accountId, setAccountId] = useState(initialAccounts.length === 1 ? initialAccounts[0].id : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(result === "cancelled" ? "Você cancelou a autorização. A conexão anterior foi mantida." : result === "failed" ? "Não foi possível concluir a autorização. Tente conectar novamente nesta página." : "");
  const [message, setMessage] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const query = `?establishmentId=${encodeURIComponent(state.establishment.id)}`;
  async function action(kind: "start" | "confirm" | "disconnect") {
    setBusy(true); setError(""); setMessage("");
    try {
      const path = kind === "start" ? "/authorize" : kind === "confirm" ? "/confirmation" : "";
      const response = await fetch(`/api/admin/tv/instagram${path}${query}`, { method: kind === "disconnect" ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, ...(kind === "confirm" ? { body: JSON.stringify({ accountId }) } : {}) });
      const data = await response.json();
      if (!response.ok) {
        if (typeof data.canonicalUrl === "string") setCanonicalUrl(data.canonicalUrl);
        throw new Error(data.error || "Não foi possível concluir. Tente novamente.");
      }
      if (kind === "start") { window.location.assign(data.authorizationUrl); return; }
      setAccounts([]); setAllowAccountId(false); history.replaceState(null, "", `/configuracoes/instagram${query}`);
      const updated = await fetch(`/api/admin/tv${query}`, { cache: "no-store" });
      if (!updated.ok) throw new Error("A alteração foi salva. Reabra esta página para atualizar o status.");
      setState(await updated.json());
      setMessage(kind === "confirm" ? `Instagram @${data.username} conectado à loja ${state.establishment.name}.` : "Instagram desconectado desta loja. Seus arquivos enviados continuam disponíveis.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível conectar."); } finally { setBusy(false); }
  }
  return <><span className={styles.kicker}>INSTAGRAM DA LOJA</span><h1>{state.establishment.name}</h1><p>Autorize o Instagram profissional da loja para exibir seus stories na TV. Você faz login na Meta e confirma a conta aqui.</p>{state.instagram.connected && <p>Conta atual: <strong>@{state.instagram.username}</strong></p>}{state.instagram.error && <p role="alert">{state.instagram.error}</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}{canonicalUrl && <a href={canonicalUrl} className={styles.primaryButton}>Abrir endereço principal do Mordomê</a>}
    {accounts.length > 0 || allowAccountId ? <form className={styles.pairForm} onSubmit={event => { event.preventDefault(); void action("confirm"); }}><p>Confira a conta que será exibida na TV de <strong>{state.establishment.name}</strong>.</p>{allowAccountId ? <><p>A Meta autorizou o acesso, mas não retornou a lista de contas. Informe o ID profissional da conta que você selecionou. Vamos validar o perfil e os stories antes de conectar.</p><label className={styles.field}>ID da conta profissional do Instagram<input value={accountId} onChange={event => setAccountId(event.target.value.trim())} inputMode="numeric" pattern="[0-9]{5,30}" maxLength={30} required disabled={busy}/></label><p className={styles.smallNote}>Encontre o ID em Configurações do negócio da Meta → Contas → Contas do Instagram → selecione sua conta. Não informe token ou senha.</p></> : <label className={styles.field}>Instagram autorizado<select value={accountId} onChange={event => setAccountId(event.target.value)} required disabled={busy}><option value="">Selecione uma conta</option>{accounts.map(account => <option key={account.id} value={account.id}>@{account.username}</option>)}</select></label>}<button className={styles.primaryButton} disabled={busy || !accountId}>{busy ? "Validando acesso aos stories…" : "Confirmar Instagram desta loja"}</button><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void action("start")}>Usar outra conta</button></form> : <div className={styles.pairForm}>{state.instagram.configured ? <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => void action("start")}>{busy ? "Abrindo autorização…" : state.instagram.connected ? "Reconectar ou trocar Instagram" : "Continuar com Instagram"}</button> : <p>A conexão com o Instagram está sendo preparada pelo Mordomê. Por enquanto, use as fotos e os vídeos enviados para a TV.</p>}</div>}
    {state.instagram.connected && <button type="button" className={styles.dangerLink} disabled={busy} onClick={() => { if (window.confirm(`Desconectar @${state.instagram.username} da loja ${state.establishment.name}?`)) void action("disconnect"); }}>Desconectar Instagram desta loja</button>}
    <p className={styles.smallNote}>A conta precisa ser profissional. A Meta pode solicitar o portfólio empresarial e a escolha dos ativos autorizados. Stories indisponíveis pela API não são exibidos.</p>{state.settings.source === "upload" && state.instagram.connected && <p>Para mostrar os stories na TV, escolha “Instagram e arquivos enviados” em Aparência e reprodução.</p>}<p className={styles.smallNote}><Link href="/privacidade">Política de Privacidade</Link> · <Link href="/exclusao-de-dados">Excluir meus dados</Link></p></>;
}
