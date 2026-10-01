import { z } from "zod";

export type RoutePoint = { lat: number; lng: number };
export type RouteStep = { instruction: string; distanceMeters: number };
export type Route = { coordinates: RoutePoint[]; distanceMeters: number; durationSeconds: number; steps: RouteStep[] };
const coordinate = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const nonnegative = z.number().finite().nonnegative();
const maneuver = z.object({ type: z.string(), modifier: z.string().optional(), exit: z.number().int().positive().optional() });
const responseSchema = z.object({ code: z.literal("Ok"), routes: z.array(z.object({
  distance: nonnegative, duration: nonnegative,
  geometry: z.object({ coordinates: z.array(coordinate).min(2) }),
  legs: z.array(z.object({ steps: z.array(z.object({ name: z.string(), distance: nonnegative, maneuver })) })),
})).min(1) });

export function routeInstruction(name: string, move: z.infer<typeof maneuver>) {
  const direction: Record<string, string> = { right: "à direita", left: "à esquerda", "slight right": "levemente à direita", "slight left": "levemente à esquerda", "sharp right": "acentuadamente à direita", "sharp left": "acentuadamente à esquerda", straight: "em frente" };
  if (move.type === "arrive") return "Chegue à parada";
  const road = name ? ` em ${name}` : "";
  if (move.type === "roundabout" || move.type === "rotary") return `Na rotatória, ${move.exit ? `pegue a ${move.exit}ª saída` : "siga a saída indicada"}${road}`;
  if (move.modifier === "uturn") return `Faça o retorno${road}`;
  if (move.type === "depart") return `Siga${road || " em frente"}`;
  return `Siga ${direction[move.modifier ?? ""] ?? "em frente"}${road}`;
}
export function isRoutePoint(point: RoutePoint) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}
export function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}
export function formatEta(seconds: number) { return `${Math.max(1, Math.round(seconds / 60))} min`; }

// Existing public pilot provider (ADR 0014). Only coordinates are sent, in the chosen order.
export async function fetchRoute(origin: RoutePoint, destination: RoutePoint, options: { stops?: RoutePoint[]; signal?: AbortSignal } = {}): Promise<Route | null> {
  const points = [origin, ...(options.stops ?? []), destination];
  if (points.length > 25 || !points.every(isRoutePoint)) return null;
  try {
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000);
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${points.map(point => `${point.lng},${point.lat}`).join(";")}?overview=full&geometries=geojson&steps=true`, { signal });
    if (!response.ok) return null;
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) return null;
    const route = parsed.data.routes[0];
    return { coordinates: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), distanceMeters: route.distance, durationSeconds: route.duration,
      steps: route.legs.flatMap(leg => leg.steps.map(step => ({ instruction: routeInstruction(step.name, step.maneuver), distanceMeters: step.distance }))),
    };
  } catch { return null; }
}
