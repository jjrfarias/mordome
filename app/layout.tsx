import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mordomê — Tudo sob controle",
  description: "Gestão simples para bares e restaurantes",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#173f35", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
