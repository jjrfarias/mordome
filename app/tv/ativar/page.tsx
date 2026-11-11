import type { Metadata } from "next";
import { TvActivation } from "@/components/tv/TvActivation";

export const metadata: Metadata = { title: "Ativar TV · Mordomê", robots: { index: false, follow: false } };
export default function Page() { return <TvActivation/>; }
