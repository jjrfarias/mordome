import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { TvDisplayClient } from "@/components/tv/TvDisplayClient";
import { TvPairingScreen } from "@/components/tv/TvPairingScreen";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "TV · Mordomê", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function TvPreviewPage({ searchParams }: { searchParams: Promise<{ establishmentId?: string | string[]; setup?: string }> }) {
  const query = await searchParams;
  if (typeof query.establishmentId !== "string") {
    const displayId = (await cookies()).get("mordome_tv_screen")?.value;
    if (query.setup !== "1" && displayId && /^[a-zA-Z0-9_-]{1,100}$/.test(displayId)) redirect(`/tv/${displayId}`);
    return <TvPairingScreen/>;
  }
  const session = await getCurrentSession();
  if (!session || !session.canManageIntegrations) redirect("/");
  const establishmentId = typeof query.establishmentId === "string" ? query.establishmentId : session.establishment.id;
  if (!session.establishments.some(item => item.id === establishmentId)) redirect("/");
  return <TvDisplayClient establishmentId={establishmentId}/>;
}
