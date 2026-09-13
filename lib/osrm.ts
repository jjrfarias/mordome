export type RoutePoint = { lat: number; lng: number };
export type Route = { coordinates: RoutePoint[]; distanceMeters: number; durationSeconds: number };

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

/**
 * Free driving route via the public OSRM demo server — no API key, no billing.
 * It's a shared demo instance meant for light use: no uptime guarantee and a
 * soft rate limit, fine for a small pilot's delivery volume. If this ever
 * needs to be reliable at scale, replace with a self-hosted OSRM instance or
 * a signed-up provider like OpenRouteService, keeping this same return shape.
 */
export async function fetchRoute(origin: RoutePoint, destination: RoutePoint): Promise<Route | null> {
  try {
    const url = `${OSRM_BASE}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return null;
    const data = await response.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    const coordinates: RoutePoint[] = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
    return { coordinates, distanceMeters: route.distance, durationSeconds: route.duration };
  } catch {
    return null;
  }
}
