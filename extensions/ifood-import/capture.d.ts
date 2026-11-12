import type { IfoodCapture } from "../../lib/ifood-import.ts";
export function captureIfoodOrder(): IfoodCapture;

export function captureIfoodOrder(reportErrors: true): IfoodCapture | { captureError: string };
