"use client";
import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { Crosshair, Search, MapPin, Loader2 } from "lucide-react";
import { getApiErrorMessage, getApiStatusCode } from "@/lib/api";
import {
  geolocationMessage,
  reverseLocation,
  searchPlaces,
  type LocationSelection,
  type Place,
} from "@/services/location-service";

const LocationMap = dynamic(() => import("./location-map"), { ssr: false });
type Draft = Omit<Place, "latitude" | "longitude"> & {
  latitude: number | null;
  longitude: number | null;
};
export function LocationSelector({
  value,
  onConfirm,
  label = "Your location",
  showCoordinateFields = true,
  confirmationLabel = "Confirm & Save Location",
}: {
  value?: Partial<{ [K in keyof Draft]: Draft[K] | null }> | null;
  onConfirm: (location: LocationSelection) => Promise<void> | void;
  label?: string;
  showCoordinateFields?: boolean;
  confirmationLabel?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Draft>({
    latitude: value?.latitude ?? null,
    longitude: value?.longitude ?? null,
    city: value?.city ?? "",
    region: value?.region ?? null,
    country: value?.country ?? "",
    address: value?.address ?? "",
  });
  const [source, setSource] = useState<"manual" | "gps">("manual");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const alive = useRef(true);
  const lookups = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      lookups.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      void searchPlaces(query, controller.signal)
        .then((places) => {
          setResults(places);
          setError("");
          if (!places.length)
            setMessage(
              "No address found. Try a nearby town or enter the fields below.",
            );
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(
              getApiErrorMessage(
                e,
                "Address search failed. Manual entry is available.",
              ),
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 800);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setSearching(false);
    };
  }, [query]);
  async function locateCoordinates(
    latitude: number,
    longitude: number,
    kind: "manual" | "gps",
    accuracyM: number | null = null,
  ) {
    const current = ++sequence.current;
    lookups.current?.abort();
    const controller = new AbortController();
    lookups.current = controller;
    setSource(kind);
    setAccuracy(accuracyM);
    setDraft((d) => ({ ...d, latitude, longitude }));
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const places = await reverseLocation(
        latitude,
        longitude,
        controller.signal,
      );
      if (!alive.current || current !== sequence.current) return;
      if (places[0]) {
        setDraft({ ...places[0], latitude, longitude });
        setMessage(
          "Location detected. Review the address and confirm the pin before saving.",
        );
      } else
        setMessage(
          "Coordinates detected. Enter the address, city and country below.",
        );
    } catch (e) {
      if (alive.current && current === sequence.current)
        setError(
          getApiStatusCode(e) === 503
            ? "Address lookup is temporarily unavailable. Coordinates are kept; enter the address manually."
            : getApiErrorMessage(
                e,
                "Coordinates detected, but address lookup failed. Enter the address manually.",
              ),
        );
    } finally {
      if (alive.current && current === sequence.current) setBusy(false);
    }
  }
  function gps() {
    setError("");
    setMessage("");
    if (!window.isSecureContext) {
      setError("GPS requires HTTPS or localhost. Manual entry is available.");
      return;
    }
    if (!navigator.geolocation) {
      setError(
        "GPS is unavailable in this browser. Enter your location manually.",
      );
      return;
    }
    setBusy(true);
    const gpsRequest = ++sequence.current;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (alive.current && gpsRequest === sequence.current)
          void locateCoordinates(
            coords.latitude,
            coords.longitude,
            "gps",
            coords.accuracy,
          );
      },
      (e) => {
        if (alive.current && gpsRequest === sequence.current) {
          setBusy(false);
          setError(geolocationMessage(e));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  async function confirm() {
    if (
      draft.latitude === null ||
      draft.longitude === null ||
      !Number.isFinite(draft.latitude) ||
      !Number.isFinite(draft.longitude) ||
      Math.abs(draft.latitude) > 90 ||
      Math.abs(draft.longitude) > 180 ||
      !draft.city.trim() ||
      draft.country.trim().length < 2 ||
      draft.address.trim().length < 2
    ) {
      setError(
        showCoordinateFields
          ? "Enter valid coordinates, address, city and country, then confirm your location."
          : "Select a pin using GPS, search or the map, and enter an address, city and country before confirming.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm({
        ...draft,
        latitude: draft.latitude,
        longitude: draft.longitude,
        source,
        accuracy_m: accuracy,
        confirmed: true,
      });
      setMessage("Location confirmed.");
    } catch (e) {
      setError(getApiErrorMessage(e, "Unable to save your location."));
    } finally {
      if (alive.current) setSaving(false);
    }
  }
  return (
    <section className="fluid-location-selector" aria-label={label}>
      <div className="fluid-location-heading">
        <div>
          <h2>
            <MapPin size={20} />
            {label}
          </h2>
          <p>
            {showCoordinateFields
              ? "Choose GPS, search for an address, or enter coordinates manually."
              : "Use GPS or search for your facility, then confirm its pin on the map."}
          </p>
        </div>
        <button
          type="button"
          className="portal-btn"
          onClick={gps}
          disabled={busy || saving}
        >
          <Crosshair size={17} />
          {busy ? "Finding location…" : "Use My Current Location"}
        </button>
      </div>
      <label htmlFor={`${id}-search`}>Search addresses worldwide</label>
      <div className="fluid-location-search">
        <Search size={18} />
        <input
          id={`${id}-search`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Street, city, region or country"
          autoComplete="off"
        />
        {searching && (
          <Loader2
            size={18}
            className="animate-spin"
            aria-label="Searching addresses"
          />
        )}
      </div>
      {results.length > 0 && (
        <ul className="fluid-location-results" aria-label="Address suggestions">
          {results.map((p, i) => (
            <li key={`${p.latitude}-${p.longitude}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  sequence.current++;
                  lookups.current?.abort();
                  setBusy(false);
                  setDraft(p);
                  setSource("manual");
                  setAccuracy(null);
                  setResults([]);
                  setQuery("");
                  setMessage("Review this address and confirm the pin.");
                }}
              >
                {p.address}
              </button>
            </li>
          ))}
        </ul>
      )}
      <LocationMap
        latitude={draft.latitude}
        longitude={draft.longitude}
        onSelect={(lat, lon) => {
          if (!saving) void locateCoordinates(lat, lon, "manual");
        }}
      />
      <p className="fluid-location-hint">
        Click the map to adjust the pin and review the address below. Address lookup
        and map tiles use external providers. Your GPS position is requested
        only when you press the button.
      </p>
      <div className="fluid-location-fields">
        {(
          [
            ["address", "Address"],
            ["city", "City / town"],
            ["region", "Region / state"],
            ["country", "Country"],
          ] as const
        ).map(([key, text]) => (
          <label key={key}>
            {text}
            <input
              maxLength={key === "address" ? 255 : 120}
              value={draft[key] ?? ""}
              onChange={(e) => {
                setDraft((d) => ({ ...d, [key]: e.target.value }));
              }}
            />
          </label>
        ))}
        {showCoordinateFields && (["latitude", "longitude"] as const).map((key) => (
          <label key={key}>
            {key === "latitude" ? "Latitude" : "Longitude"}
            <input
              type="number"
              step="any"
              min={key === "latitude" ? -90 : -180}
              max={key === "latitude" ? 90 : 180}
              value={draft[key] ?? ""}
              onChange={(e) => {
                sequence.current++;
                lookups.current?.abort();
                setBusy(false);
                setSource("manual");
                setAccuracy(null);
                setDraft((d) => ({
                  ...d,
                  [key]: e.target.value === "" ? null : Number(e.target.value),
                }));
              }}
            />
          </label>
        ))}
      </div>
      {accuracy !== null && (
        <p className="fluid-location-hint">
          Reported GPS accuracy: approximately {Math.round(accuracy)} metres.
          Adjust the pin if needed.
        </p>
      )}
      {error && (
        <p role="alert" className="fluid-location-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="fluid-location-status">
          {message}
        </p>
      )}
      <button
        type="button"
        className="portal-btn"
        onClick={() => void confirm()}
        disabled={busy || saving}
      >
        {saving ? "Saving location…" : confirmationLabel}
      </button>
    </section>
  );
}
