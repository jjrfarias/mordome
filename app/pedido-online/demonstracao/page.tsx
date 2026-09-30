import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { StorefrontPage } from "@/components/storefront/StorefrontPage";
import { isStorefrontDemoEnabled } from "@/lib/storefront/demo-access";

export const metadata: Metadata = { title: "Pedido online — demonstração", robots: { index: false, follow: false } };

// Rota fixa: tem precedência sobre /pedido-online/[establishmentId]. Em produção só existe com
// STOREFRONT_DEMO_ENABLED=true, para a vitrine fictícia nunca ser confundida com uma loja real.
export default async function OnlineOrderDemoPage() {
  await connection();
  if (!isStorefrontDemoEnabled()) notFound();
  return <StorefrontPage source={{ kind: "demo" }} />;
}
