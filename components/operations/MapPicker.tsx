"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";

type Point = { lat: number; lng: number };
export function MapPicker({ value, center = null, onChange, height = 260 }: { value: Point | null; center?: Point | null; onChange: (point: Point) => void; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const changeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    let cancelled = false;
    const observer = new ResizeObserver(() => mapRef.current?.invalidateSize({ pan: false }));
    void import("leaflet").then(({ default: leaflet }) => {
      if (cancelled || !containerRef.current) return;
      const map = leaflet.map(containerRef.current, { zoomAnimation: false }).setView([-14.235, -51.9253], 4);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
      map.on("click", (event: L.LeafletMouseEvent) => changeRef.current({ lat: event.latlng.lat, lng: event.latlng.lng }));
      mapRef.current = map;
      observer.observe(containerRef.current);
      setReady(true);
    }).catch(() => { if (!cancelled) setError("Não foi possível carregar o mapa. Você pode informar o endereço por escrito."); });
    return () => { cancelled = true; observer.disconnect(); mapRef.current?.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);
  const lat = value?.lat ?? null;
  const lng = value?.lng ?? null;
  const centerLat = center?.lat ?? null;
  const centerLng = center?.lng ?? null;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void import("leaflet").then(({ default: leaflet }) => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      if (lat === null || lng === null) { markerRef.current?.remove(); markerRef.current = null; return; }
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else markerRef.current = leaflet.marker([lat, lng], { icon: leaflet.divIcon({ className: "delivery-stop-pin", html: "<span>✓</span>", iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map);
      if (!map.getBounds().contains([lat, lng]) || map.getZoom() < 14) map.setView([lat, lng], 16, { animate: false });
    });
    return () => { cancelled = true; };
  }, [ready, lat, lng]);
  useEffect(() => {
    if (ready && centerLat !== null && centerLng !== null) mapRef.current?.setView([centerLat, centerLng], 14, { animate: false });
  }, [ready, centerLat, centerLng]);

  return <div>
    <div ref={containerRef} style={{ height, borderRadius: 12, overflow: "hidden", isolation: "isolate", border: "1px solid var(--line)" }} />
    <small style={{ display: "block", marginTop: 6, color: "var(--muted)", fontSize: 12 }}>{value ? "Ponto marcado. Toque no mapa para ajustar." : "Nenhum ponto confirmado. Aproxime o mapa e toque na entrada do imóvel (opcional)."}</small>
    <button type="button" className="secondary" style={{ marginTop: 8 }} onClick={() => {
      if (!navigator.geolocation) { setError("Localização indisponível neste navegador."); return; }
      navigator.geolocation.getCurrentPosition(position => {
        if (!mapRef.current) return;
        mapRef.current.setView([position.coords.latitude, position.coords.longitude], 18, { animate: false });
        setError("Confira o endereço e toque no mapa para marcar. Sua posição atual ainda não foi salva.");
      }, () => setError("Não foi possível obter sua localização. Use o mapa para marcar o endereço."), { timeout: 10000, enableHighAccuracy: true });
    }}>Aproximar da minha localização</button>
    {error && <p role="status" style={{ fontSize: 12 }}>{error}</p>}
  </div>;
}
