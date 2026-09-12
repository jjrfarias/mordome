import { db } from "@/lib/db";
import type { IntegrationCategory } from "./types";

export { DRIVER_CATALOG, findDriver, PRINTER_DRIVERS, PAYMENT_DRIVERS, SCALE_DRIVERS } from "./types";
export type { IntegrationCategory, DriverDefinition, DriverStatus } from "./types";

export async function getActiveIntegrationDriver(establishmentId: string, category: IntegrationCategory) {
  const record = await db.establishmentIntegration.findFirst({ where: { establishmentId, category, active: true } });
  return record?.driver ?? "manual";
}

export async function getActiveIntegrations(establishmentId: string) {
  const records = await db.establishmentIntegration.findMany({ where: { establishmentId, active: true } });
  const byCategory = new Map(records.map(record => [record.category, record.driver]));
  return {
    printer: byCategory.get("PRINTER") ?? "manual",
    payment: byCategory.get("PAYMENT") ?? "manual",
    scale: byCategory.get("SCALE") ?? "manual",
  };
}
