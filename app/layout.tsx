import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Playfair_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-fraunces", display: "swap" });
const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-playfair", display: "swap" });

export const metadata: Metadata = {
  title: "Mordomê para Betão Hot Dog",
  description: "Operação Betão Hot Dog no Mordomê",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/clientes/betao/simbolo-compacto-v1.png", apple: "/clientes/betao/simbolo-compacto-v1.png" },
};

export const viewport: Viewport = { themeColor: "#a8000c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`betao-theme ${dmSans.variable} ${fraunces.variable} ${playfairDisplay.variable}`}>{children}</body></html>;
}
