"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useState } from "react";
import { MapPin, RefreshCw, Map, List, Navigation } from "lucide-react";
import { usePortalQuery } from "@/hooks/use-portal-query";
import { useLiveLocation } from "@/hooks/use-live-location";
import { getApiErrorMessage } from "@/lib/api";
import {
  getLocation,
  saveLocation,
  getNearby,
  setRadius,
} from "@/services/location-service";
import { LocationSelector } from "./location-selector";
import { PortalSkeleton } from "@/components/portal/portal-ui";
const LocationMap = dynamic(() => import("./location-map"), { ssr: false });

export function LocationWorkspace({ role }: { role: "donor" | "hospital" }) {
  const [urgency, setUrgency] = useState("all");
  const [view, setView] = useState<"map" | "list">("map");
  const [error, setError] = useState("");
  const loader = useCallback(async () => {
    const location = await getLocation();
    const nearby =
      role === "donor" &&
      location.latitude !== null &&
      location.longitude !== null
        ? await getNearby(urgency)
        : null;
    return { location, nearby };
  }, [role, urgency]);
  const query = usePortalQuery(loader, 60000);
  const refresh = query.refresh;
  const onSaved = useCallback(() => {
    void refresh();
  }, [refresh]);
  const live = useLiveLocation(query.data?.location ?? null, onSaved);
  if (query.loading && !query.data) return <PortalSkeleton />;
  if (!query.data)
    return (
      <div className="portal-error" role="alert">
        {query.error || "Unable to load location settings."}
        <button onClick={() => void query.refresh()}>Retry</button>
      </div>
    );
  const { location, nearby } = query.data;
  const points = [
    ...(nearby?.hospitals.map((h) => ({
      ...h,
      label: `${h.name} · ${h.distance_km} km`,
      kind: "hospital" as const,
    })) ?? []),
    ...(nearby?.requests.map((r) => ({
      ...r,
      id: `request-${r.id}`,
      label: `${r.blood_type} · ${r.hospital_name} · ${r.distance_km} km`,
      kind: "request" as const,
      href: `/donor/requests?request=${r.id}`,
    })) ?? []),
  ];
  return (
    <div className="fluid-location-workspace">
      <div className="portal-page-title">
        <div>
          <h1>
            <MapPin size={25} />
            Location & nearby care
          </h1>
          <p>Share a location you choose. Keep control of every update.</p>
        </div>
        <button
          className="portal-btn portal-btn--secondary"
          onClick={() => void query.refresh()}
        >
          <RefreshCw size={16} />
          Refresh results
        </button>
      </div>
      {(query.error || error) && (
        <p role="alert" className="portal-error">
          {error || query.error}
        </p>
      )}
      <LocationSelector
        key={`${role}-selector`}
        value={location}
        label={
          role === "hospital"
            ? "Confirm your facility location"
            : "Your donation location"
        }
        onConfirm={async (selection) => {
          live.toggle(false);
          await saveLocation(selection);
          await query.refresh();
        }}
      />
      <section className="portal-panel fluid-location-controls">
        <h2>
          <Navigation size={19} />
          Location status
        </h2>
        <p>
          {location.updated_at
            ? `Last updated: ${new Date(location.updated_at).toLocaleString()}`
            : "No GPS or map-confirmed location saved yet."}
        </p>
        <p>
          {location.confirmed_at
            ? "Location confirmed."
            : role === "hospital"
              ? "After hospital verification, an administrator must confirm this facility location for nearby discovery."
              : "Confirm your pin to save a location."}
        </p>
        {role === "donor" && (
          <>
            <label>
              Preferred search radius
              <select
                aria-label="Preferred search radius"
                value={location.preferred_radius_km ?? 25}
                onChange={(e) => {
                  setError("");
                  void setRadius(Number(e.target.value))
                    .then(() => query.refresh())
                    .catch((e) =>
                      setError(
                        getApiErrorMessage(e, "Unable to save your radius."),
                      ),
                    );
                }}
              >
                {[5, 10, 25, 50, 100].map((r) => (
                  <option key={r} value={r}>
                    {r} km
                  </option>
                ))}
              </select>
            </label>
            <label className="fluid-live-toggle">
              <input
                type="checkbox"
                checked={live.enabled}
                onChange={(e) => live.toggle(e.target.checked)}
              />
              Live Location — I consent to GPS updates during this visible
              location page only.
            </label>
            <p className="fluid-location-hint">
              Off by default. Stops when disabled, the tab is hidden, you leave
              this page or your session ends. No travel history is stored. Your
              precise coordinates are never shared with hospitals.
            </p>
            <p role="status">{live.status}</p>
          </>
        )}
      </section>
      {role === "donor" && nearby && (
        <section className="portal-panel fluid-nearby">
          <div className="fluid-location-heading">
            <div>
              <h2>Nearby hospitals & compatible requests</h2>
              <p>Within {nearby.radius_km} km · straight-line distance</p>
            </div>
            <div className="fluid-location-actions">
              <button
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
              >
                <Map size={16} />
                Map
              </button>
              <button
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={16} />
                List
              </button>
            </div>
          </div>
          <label>
            Request urgency
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
            >
              {["all", "routine", "urgent", "critical"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {view === "map" && (
            <>
              <LocationMap
                latitude={location.latitude}
                longitude={location.longitude}
                radiusKm={nearby.radius_km}
                points={points}
              />
              <p className="fluid-location-hint">
                Crimson: blood requests · Blue: verified hospitals with
                confirmed locations. Map data © OpenStreetMap contributors.
              </p>
            </>
          )}
          <div className="fluid-nearby-lists">
            <div>
              <h3>Verified hospitals ({nearby.hospitals.length})</h3>
              {nearby.hospitals.map((h) => (
                <article key={h.id}>
                  <strong>{h.name}</strong>
                  <span>
                    {h.city} · {h.distance_km} km away
                  </span>
                </article>
              ))}
              {!nearby.hospitals.length && (
                <p>No confirmed verified hospitals in this radius.</p>
              )}
            </div>
            <div>
              <h3>Compatible requests ({nearby.requests.length})</h3>
              {nearby.requests.map((r) => (
                <article key={r.id}>
                  <strong>
                    {r.blood_type} · {r.hospital_name}
                  </strong>
                  <span>
                    {r.units} units · {r.urgency} · {r.distance_km} km
                  </span>
                  <Link href={`/donor/requests?request=${r.id}`}>
                    View request →
                  </Link>
                </article>
              ))}
              {!nearby.requests.length && (
                <p>
                  No compatible requests in this radius. Check availability and
                  profile eligibility, or expand your radius.
                </p>
              )}
            </div>
          </div>
          <p className="fluid-location-hint">{nearby.notice}</p>
          {nearby.has_more && (
            <p role="status">
              Showing the nearest results. Narrow your radius or urgency to
              refine this view.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
