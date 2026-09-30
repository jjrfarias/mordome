import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Playfair_Display } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-fraunces", display: "swap" });
const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-playfair", display: "swap" });

export const metadata: Metadata = {
  title: "Mordomê — Tudo sob controle",
  description: "Gestão simples para bares e restaurantes",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#163c32", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${dmSans.variable} ${fraunces.variable} ${playfairDisplay.variable}`}>{children}</body></html>;
}
