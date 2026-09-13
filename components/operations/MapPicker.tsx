"use client";

import { useEffect, useRef } from "react";
import type L from "leaflet";

const DEFAULT_CENTER: [number, number] = [-14.235, -51.9253];

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

export function MapPicker({ value, onChange, height = 220 }: { value: { lat: number; lng: number } | null; onChange: (point: { lat: number; lng: number }) => void; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadLeaflet().then(leaflet => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const center = value ? [value.lat, value.lng] as [number, number] : DEFAULT_CENTER;
      const map = leaflet.map(containerRef.current).setView(center, value ? 16 : 4);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      if (value) markerRef.current = leaflet.marker(center).addTo(map);
      map.on("click", (event: L.LeafletMouseEvent) => {
        const point = { lat: event.latlng.lat, lng: event.latlng.lng };
        if (markerRef.current) markerRef.current.setLatLng([point.lat, point.lng]);
        else markerRef.current = leaflet.marker([point.lat, point.lng]).addTo(map);
        onChange(point);
      });
      mapRef.current = map;
      if (!value && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => { if (!cancelled) map.setView([position.coords.latitude, position.coords.longitude], 15); }, () => {}, { timeout: 4000 });
      }
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div>
    <div ref={containerRef} style={{ height, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }} />
    <small style={{ display: "block", marginTop: 6, color: "var(--muted)", fontSize: 9 }}>{value ? "Toque no mapa para ajustar o ponto de entrega." : "Toque no mapa para marcar o ponto de entrega (opcional)."}</small>
  </div>;
}
