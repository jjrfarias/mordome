import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { TvDisplayClient } from "@/components/tv/TvDisplayClient";

export const metadata: Metadata = { title: "TV · Mordomê", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TvPreviewPage({ searchParams }: { searchParams: Promise<{ establishmentId?: string | string[] }> }) {
  const session = await getCurrentSession();
  if (!session || !session.canManageIntegrations) redirect("/");
  const query = await searchParams;
  const establishmentId = typeof query.establishmentId === "string" ? query.establishmentId : session.establishment.id;
  if (!session.establishments.some(item => item.id === establishmentId)) redirect("/");
  return <TvDisplayClient establishmentId={establishmentId}/>;
}
