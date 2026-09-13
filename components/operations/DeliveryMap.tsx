"use client";

import { useEffect, useRef } from "react";
import type L from "leaflet";
import { fetchRoute, type RoutePoint } from "@/lib/osrm";

let iconsFixed = false;
async function loadLeaflet() {
  const leaflet = (await import("leaflet")).default;
  if (!iconsFixed) {
    iconsFixed = true;
    delete (leaflet.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
    leaflet.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  }
  return leaflet;
}

type Destination = { orderId: string; lat: number; lng: number; label: string };
type CourierPoint = { courierId: string; lat: number; lng: number; label: string };
type RoutePair = { courierId: string; destination: RoutePoint; label?: string };

const routeCacheKey = (origin: RoutePoint, destination: RoutePoint) => `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
const routeCache = new Map<string, Awaited<ReturnType<typeof fetchRoute>>>();

function formatEta(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 1 ? "menos de 1 min" : `${minutes} min`;
}
function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function DeliveryMap({ destinations, couriers, routes = [], height = 320 }: { destinations: Destination[]; couriers: CourierPoint[]; routes?: RoutePair[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then(leaflet => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = leaflet.map(containerRef.current).setView([-14.235, -51.9253], 4);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      layerRef.current = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; layerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then(async leaflet => {
      const map = mapRef.current; const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();
      const bikeIcon = leaflet.divIcon({ className: "delivery-map-courier-icon", html: "🛵", iconSize: [26, 26] });
      const points: [number, number][] = [];
      for (const destination of destinations) { leaflet.marker([destination.lat, destination.lng]).bindTooltip(destination.label, { permanent: false }).addTo(layer); points.push([destination.lat, destination.lng]); }
      for (const courier of couriers) { leaflet.marker([courier.lat, courier.lng], { icon: bikeIcon }).bindTooltip(courier.label, { permanent: false }).addTo(layer); points.push([courier.lat, courier.lng]); }
      if (points.length) map.fitBounds(points as L.LatLngBoundsLiteral, { padding: [30, 30], maxZoom: 15 });

      for (const pair of routes) {
        const origin = couriers.find(candidate => candidate.courierId === pair.courierId);
        if (!origin) continue;
        const key = routeCacheKey(origin, pair.destination);
        let route = routeCache.get(key);
        if (route === undefined) { route = await fetchRoute(origin, pair.destination); routeCache.set(key, route); }
        if (cancelled || !route) continue;
        leaflet.polyline(route.coordinates.map(point => [point.lat, point.lng]), { color: "#d86f45", weight: 4, opacity: 0.8 })
          .bindTooltip(`${pair.label ?? "Rota"} · ${formatDistance(route.distanceMeters)} · ${formatEta(route.durationSeconds)}`, { permanent: true, direction: "center", className: "delivery-route-tooltip" })
          .addTo(layer);
      }
    });
    return () => { cancelled = true; };
  }, [destinations, couriers, routes]);

  if (destinations.length === 0 && couriers.length === 0) return null;
  return <div ref={containerRef} style={{ height, borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)", marginBottom: 20 }} />;
}
