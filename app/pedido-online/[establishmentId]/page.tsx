import { StorefrontPage } from "@/components/storefront/StorefrontPage";

export default async function OnlineOrderPage({ params }: { params: Promise<{ establishmentId: string }> }) {
  const { establishmentId } = await params;
  return <StorefrontPage source={{ kind: "live", establishmentId }} />;
}
