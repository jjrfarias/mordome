import type { IntegrationCategory } from "@/lib/integrations/types";

type LocalIntegration = { driver: string; config: Record<string, string> };
const stores = new Map<string, Record<IntegrationCategory, LocalIntegration>>();

function storeFor(establishmentId: string) {
  if (!stores.has(establishmentId)) {
    stores.set(establishmentId, {
      PRINTER: { driver: "manual", config: {} },
      PAYMENT: { driver: "manual", config: {} },
      SCALE: { driver: "manual", config: {} },
    });
  }
  return stores.get(establishmentId)!;
}

export function getLocalIntegrations(establishmentId: string) {
  return storeFor(establishmentId);
}

export function getLocalIntegrationDriver(establishmentId: string, category: IntegrationCategory) {
  return storeFor(establishmentId)[category].driver;
}

export function setLocalIntegration(establishmentId: string, category: IntegrationCategory, driver: string, config: Record<string, string>) {
  const store = storeFor(establishmentId);
  store[category] = { driver, config };
  return store[category];
}
