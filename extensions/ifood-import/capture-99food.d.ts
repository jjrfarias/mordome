import type { IfoodCapture } from "../../lib/ifood-import.ts";
export function capture99FoodOrder(): IfoodCapture;

export function capture99FoodOrder(reportErrors: true): IfoodCapture | { captureError: string };
