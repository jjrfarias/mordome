"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import { fetchRoute, formatDistance, formatEta, isRoutePoint, type Route, type RoutePoint } from "@/lib/osrm";

type Destination = RoutePoint & { orderId: string; label: string };
type CourierPoint = RoutePoint & { courierId: string; label: string; updatedAt?: string };
type RoutePair = { courierId: string; destination: RoutePoint; stops?: RoutePoint[]; label?: string };
type MapData = { destinations: Destination[]; couriers: CourierPoint[]; routes: RoutePair[] };
type Result = { label: string; route: Route | null };
const textNode = (value: string) => { const node = document.createElement("span"); node.textContent = value; return node; };

export function DeliveryMap({ destinations, couriers, routes = [], height = 360, showInstructions = false }: MapData & { height?: number; showInstructions?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const boundsRef = useRef<L.LatLngBoundsLiteral | null>(null);
  const fittedRef = useRef(false);
  const cacheRef = useRef(new Map<string, { route: Route; time: number }>());
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; results: Result[]; error?: string }>({ key: "", results: [] });
  // Polling recreates arrays; only coordinate/label changes should redraw the map.
  const snapshot = JSON.stringify({ destinations, couriers, routes });
  const stateKey = `${snapshot}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    let layer: L.LayerGroup | undefined;
    const data = JSON.parse(snapshot) as MapData;
    const run = async () => {
      try {
        const leaflet = (await import("leaflet")).default;
        if (controller.signal.aborted || !containerRef.current) return;
        if (!mapRef.current) {
          mapRef.current = leaflet.map(containerRef.current, { zoomAnimation: false }).setView([-14.235, -51.9253], 4);
          leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(mapRef.current);
        }
        const map = mapRef.current;
        layer = leaflet.layerGroup().addTo(map);
        const points: [number, number][] = [];
        data.destinations.forEach((destination, index) => {
          if (!isRoutePoint(destination)) return;
          const icon = leaflet.divIcon({ className: "delivery-stop-pin", html: `<span>${index + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
          leaflet.marker([destination.lat, destination.lng], { icon }).bindTooltip(textNode(`${index + 1}. ${destination.label}`)).addTo(layer!);
          points.push([destination.lat, destination.lng]);
        });
        data.couriers.forEach(courier => {
          if (!isRoutePoint(courier)) return;
          const icon = leaflet.divIcon({ className: "delivery-map-courier-icon", html: "🛵", iconSize: [30, 30] });
          leaflet.marker([courier.lat, courier.lng], { icon }).bindTooltip(textNode(courier.label)).addTo(layer!);
          points.push([courier.lat, courier.lng]);
        });
        boundsRef.current = points.length ? points : null;
        if (points.length && !fittedRef.current) { map.fitBounds(points, { padding: [35, 35], maxZoom: 16 }); fittedRef.current = true; }
        const results: Result[] = [];
        for (const pair of data.routes) {
          if (controller.signal.aborted) return;
          const origin = data.couriers.find(candidate => candidate.courierId === pair.courierId);
          const label = pair.label ?? "Percurso";
          if (!origin) { results.push({ label, route: null }); continue; }
          const key = JSON.stringify([origin.lat, origin.lng, pair.stops, pair.destination]);
          const cached = cacheRef.current.get(key);
          const route = cached && Date.now() - cached.time < 30000 ? cached.route : await fetchRoute(origin, pair.destination, { stops: pair.stops, signal: controller.signal });
          if (controller.signal.aborted) return;
          results.push({ label, route });
          if (!route) continue;
          if (cacheRef.current.size >= 30) cacheRef.current.clear();
          cacheRef.current.set(key, { route, time: Date.now() });
          const coordinates: [number, number][] = route.coordinates.map(point => [point.lat, point.lng]);
          points.push(...coordinates);
          leaflet.polyline(coordinates, { color: getComputedStyle(containerRef.current).getPropertyValue("--green").trim() || "#163c32", weight: 5, opacity: 0.8 }).bindTooltip(textNode(`${label} · ${formatDistance(route.distanceMeters)} · ${formatEta(route.durationSeconds)}`)).addTo(layer!);
        }
        boundsRef.current = points.length ? points : null;
        setState({ key: `${snapshot}:${retry}`, results });
      } catch { if (!controller.signal.aborted) setState({ key: `${snapshot}:${retry}`, results: [], error: "Não foi possível carregar o mapa." }); }
    };
    const timer = setTimeout(() => void run(), 400);
    return () => { clearTimeout(timer); controller.abort(); layer?.remove(); };
  }, [snapshot, retry]);

  useEffect(() => {
    const cache = cacheRef.current;
    const observer = new ResizeObserver(() => {
      mapRef.current?.invalidateSize({ pan: false });
      if (boundsRef.current) mapRef.current?.fitBounds(boundsRef.current, { padding: [35, 35], maxZoom: 16, animate: false });
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => { observer.disconnect(); mapRef.current?.remove(); mapRef.current = null; fittedRef.current = false; cache.clear(); };
  }, []);
  const loading = state.key !== stateKey;
  return <section className="delivery-route-panel" aria-label="Mapa de entregas">
    <div className="delivery-route-heading"><div><strong>Percurso de entrega</strong><small>Paradas numeradas · posição do entregador 🛵</small></div><button type="button" className="secondary" onClick={() => { if (boundsRef.current) mapRef.current?.fitBounds(boundsRef.current, { padding: [35, 35], maxZoom: 16 }); }}>Ver percurso inteiro</button></div>
    <div ref={containerRef} style={{ height }} className="delivery-map-canvas" />
    <div className="delivery-route-summary" aria-live="polite">
      {loading ? <p>Carregando mapa e calculando percurso…</p> : state.error ? <p role="alert">{state.error}</p> : <>
        {!destinations.length && !couriers.length && <p>As entregas com ponto marcado e os entregadores com localização aparecerão aqui.</p>}
        {destinations.length > 0 && !routes.length && <p>Ative a localização para calcular o percurso até as paradas.</p>}
        {state.results.map((result, index) => <div key={index}>
          <strong>{result.label}</strong>
          {result.route ? <><p>{formatDistance(result.route.distanceMeters)} · {formatEta(result.route.durationSeconds)} estimados para o percurso</p>{showInstructions && <details><summary>Instruções do percurso</summary><ol>{result.route.steps.map((step, stepIndex) => <li key={stepIndex}>{step.instruction} <small>· {formatDistance(step.distanceMeters)}</small></li>)}</ol></details>}</> : <p>Rota indisponível. Verifique a localização e tente novamente.</p>}
        </div>)}
      </>}
      <button type="button" className="secondary" disabled={loading} onClick={() => { cacheRef.current.clear(); setRetry(value => value + 1); }}>Recalcular percurso</button>
      <small>Estimativa por vias para automóvel, sem trânsito em tempo real.</small>
    </div>
  </section>;
}
