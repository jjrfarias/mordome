import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mordomê para Betão Hot Dog",
  description: "Operação Betão Hot Dog no Mordomê",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/clientes/betao/simbolo-compacto-v1.png", apple: "/clientes/betao/simbolo-compacto-v1.png" },
};

export const viewport: Viewport = { themeColor: "#a8000c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className="betao-theme">{children}</body></html>;
}
