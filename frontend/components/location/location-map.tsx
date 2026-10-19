"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  href?: string;
  kind?: "hospital" | "request";
}
export default function LocationMap({
  latitude,
  longitude,
  points = [],
  onSelect,
  radiusKm,
}: {
  latitude: number | null;
  longitude: number | null;
  points?: MapPoint[];
  onSelect?: (latitude: number, longitude: number) => void;
  radiusKm?: number;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef<LayerGroup | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    void import("leaflet").then((L) => {
      if (cancelled || !element.current) return;
      const instance = L.map(element.current, {
        scrollWheelZoom: false,
      }).setView([0, 0], 2);
      map.current = instance;
      L.tileLayer(
        process.env.NEXT_PUBLIC_MAP_TILE_URL ||
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        },
      )
        .on("tileerror", () => setTileError(true))
        .addTo(instance);
      layers.current = L.layerGroup().addTo(instance);
      instance.on("click", (e) =>
        select.current?.(
          Math.max(-90, Math.min(90, e.latlng.lat)),
          ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180,
        ),
      );
      observer = new ResizeObserver(() => instance.invalidateSize());
      observer.observe(element.current);
      setReady(true);
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
      layers.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current || !layers.current) return;
    const instance = map.current,
      group = layers.current;
    void import("leaflet").then((L) => {
      if (map.current !== instance) return;
      group.clearLayers();
      if (latitude !== null && longitude !== null) {
        instance.setView(
          [latitude, longitude],
          radiusKm ? Math.max(7, 13 - Math.log2(radiusKm / 5)) : 14,
          { animate: false },
        );
        const marker = L.circleMarker([latitude, longitude], {
          radius: 9,
          color: "#C0392B",
          fillOpacity: 0.9,
        }).addTo(group);
        marker.bindTooltip(
          select.current
            ? "Selected location — click the map to adjust"
            : "Your saved location",
        );
        if (radiusKm)
          L.circle([latitude, longitude], {
            radius: radiusKm * 1000,
            color: "#C0392B",
            weight: 1,
            fillOpacity: 0.035,
            interactive: false,
          }).addTo(group);
      }
      for (const point of points) {
        const text = document.createElement(point.href ? "a" : "span");
        text.textContent = point.label;
        if (point.href && text instanceof HTMLAnchorElement)
          text.href = point.href;
        L.circleMarker([point.latitude, point.longitude], {
          radius: 8,
          color: point.kind === "request" ? "#C0392B" : "#155e75",
          fillOpacity: 0.85,
        })
          .bindPopup(text)
          .addTo(group);
      }
    });
  }, [ready, latitude, longitude, points, radiusKm]);
  return (
    <div className="fluid-location-map-wrap">
      <div
        ref={element}
        className="fluid-location-map"
        aria-label={
          onSelect
            ? "Location selection map. Click to adjust; coordinate fields are also available."
            : "Nearby hospitals and blood requests map"
        }
      />
      {tileError && (
        <p role="status">
          Map tiles are unavailable. Location fields and the list remain
          available.
        </p>
      )}
    </div>
  );
}
