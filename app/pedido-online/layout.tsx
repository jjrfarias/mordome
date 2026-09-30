import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

// A vitrine do consumidor tem tema próprio (ADR 0056); o painel operacional segue a identidade padrão.
const inter = Inter({ subsets: ["latin"], variable: "--font-storefront", display: "swap" });

export const metadata: Metadata = { title: "Pedido online", description: "Cardápio e pedido online" };
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function OnlineOrderLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={inter.variable}>{children}</div>;
}
