import type { Metadata } from "next";
import { TvCastReceiver } from "@/components/tv/TvCastReceiver";

export const metadata: Metadata = { title: "Mordomê TV · Google Cast", robots: { index: false, follow: false } };
export default function TvReceiverPage() { return <TvCastReceiver/>; }
