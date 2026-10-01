import { z } from "zod";

export const deliveryLocationSchema = z.object({
  action: z.literal("SET_LOCATION"),
  orderId: z.string().min(1),
  destinationLat: z.number().finite().min(-90).max(90),
  destinationLng: z.number().finite().min(-180).max(180),
});

// A CEP coordinate is a search reference, never evidence of a delivery point.
export function confirmedDeliveryCoordinates(input: { destinationLat?: number; destinationLng?: number; locationConfirmed?: boolean }) {
  if (input.locationConfirmed !== true || typeof input.destinationLat !== "number" || typeof input.destinationLng !== "number" || !Number.isFinite(input.destinationLat) || !Number.isFinite(input.destinationLng) || Math.abs(input.destinationLat) > 90 || Math.abs(input.destinationLng) > 180) {
    return { destinationLat: undefined, destinationLng: undefined };
  }
  return { destinationLat: input.destinationLat, destinationLng: input.destinationLng };
}
