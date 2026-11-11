import type { Metadata } from "next";
import { TvDisplayClient } from "@/components/tv/TvDisplayClient";

export const metadata: Metadata = { title: "Exibição na TV · Mordomê", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function TvDisplayPage({ params }: { params: Promise<{ displayId: string }> }) {
  const { displayId } = await params;
  return <TvDisplayClient displayId={displayId}/>;
}
