import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentSession } from "@/lib/auth";
import { readTvPlaylist } from "@/lib/tv-server";
import { instagramAccounts, pendingInstagramAuthorization } from "@/lib/tv-instagram-authorization";
import { InstagramConnection } from "@/components/tv/InstagramConnection";
import styles from "@/components/tv/tv.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conectar Instagram · Mordomê", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ searchParams }: { searchParams: Promise<{ establishmentId?: string; result?: string }> }) {
  const session = await getCurrentSession();
  const query = await searchParams;
  const unit = session?.establishments.find(item => item.id === (query.establishmentId ?? session.establishment.id));
  if (!session || !session.canManageIntegrations || !unit) return <main className={styles.gate}><div className={styles.gateCard}><h1>Conectar Instagram</h1><p>Entre no Mordomê com um usuário autorizado a gerenciar as integrações da loja e abra Conectar Instagram novamente.</p><Link href="/">Entrar no Mordomê</Link></div></main>;
  const state = await readTvPlaylist(unit.id);
  const pending = await pendingInstagramAuthorization({ actorId: session.user.id, organizationId: session.organization.id, establishmentId: unit.id });
  return <main className={styles.gate}><div className={styles.gateCard}><InstagramConnection initialState={state} accounts={pending ? instagramAccounts(pending.accounts) : []} result={query.result === "cancelled" || query.result === "failed" ? query.result : ""}/><Link href="/">Voltar ao Mordomê</Link></div></main>;
}
