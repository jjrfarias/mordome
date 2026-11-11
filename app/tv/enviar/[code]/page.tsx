import type { Metadata } from "next";
import { findTvGuestStore } from "@/lib/tv-guest";
import { TvGuestUpload } from "@/components/tv/TvGuestUpload";
import { TvError } from "@/lib/tv-model";
import styles from "@/components/tv/guest.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seu momento na TV · Mordomê", robots: { index: false, follow: false } };
export default async function GuestPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const store = await findTvGuestStore(code).catch(error => {
    if (!(error instanceof TvError)) throw error;
    return null;
  });
  if (!store) return <main className={styles.page}><section className={styles.card}><h1>Este link não está disponível.</h1><p>Leia o QR Code que aparece na TV da loja para continuar.</p></section></main>;
  return <TvGuestUpload code={code} name={store.brandName || store.establishment.name} unit={store.establishment.name} logo={store.establishment.logoUrl || store.establishment.organization.brandLogoUrl} available={store.available}/>;
}
