"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  geolocationMessage,
  reverseLocation,
  saveLocation,
  type SavedLocation,
} from "@/services/location-service";

/** No persisted opt-in, history or background worker. Hidden/unmounted tabs stop. */
export function useLiveLocation(
  location: SavedLocation | null,
  onSaved: (value: SavedLocation) => void,
) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("");
  const watcher = useRef<number | null>(null);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const latest = useRef(location);
  latest.current = location;
  const callback = useRef(onSaved);
  callback.current = onSaved;
  const stop = useCallback(() => {
    generation.current++;
    if (watcher.current !== null)
      navigator.geolocation?.clearWatch(watcher.current);
    watcher.current = null;
    pending.current?.abort();
    pending.current = null;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    if (
      !window.isSecureContext ||
      !navigator.geolocation ||
      document.visibilityState !== "visible"
    ) {
      setStatus("Live location requires a visible HTTPS or localhost session.");
      setEnabled(false);
      return;
    }
    let lastSent = 0,
      busy = false;
    const current = ++generation.current;
    watcher.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const saved = latest.current;
        if (
          generation.current !== current ||
          document.visibilityState !== "visible" ||
          !saved?.address ||
          busy ||
          Date.now() - lastSent < 60000
        )
          return;
        if (coords.accuracy > 1000) {
          setStatus(
            "Waiting for a more accurate GPS fix. Your saved location is unchanged.",
          );
          return;
        }
        busy = true;
        const controller = new AbortController();
        pending.current = controller;
        void (async () => {
          try {
            let place = {
              city: saved.city,
              country: saved.country,
              address: saved.address!,
              region: saved.region,
            };
            let addressFresh = false;
            try {
              const results = await reverseLocation(
                coords.latitude,
                coords.longitude,
                controller.signal,
              );
              if (results[0]) {
                place = results[0];
                addressFresh = true;
              }
            } catch {
              /* GPS updates can continue with the last confirmed address. */
            }
            if (
              generation.current !== current ||
              controller.signal.aborted ||
              document.visibilityState !== "visible"
            )
              return;
            const result = await saveLocation(
              {
                ...place,
                latitude: coords.latitude,
                longitude: coords.longitude,
                source: "live",
                accuracy_m: coords.accuracy,
                confirmed: true,
              },
              controller.signal,
            );
            if (generation.current !== current) return;
            lastSent = Date.now();
            latest.current = result;
            callback.current(result);
            setStatus(
              addressFresh
                ? "Live location updated. Updates are limited to once per minute."
                : "GPS updated. Address lookup is unavailable; the address shown is the last confirmed address.",
            );
          } catch {
            if (!controller.signal.aborted) {
              stop();
              setEnabled(false);
              setStatus(
                "Live updates stopped because the session or location service is unavailable. Refresh your location manually.",
              );
            }
          } finally {
            busy = false;
          }
        })();
      },
      (error) => {
        if (generation.current === current) {
          stop();
          setEnabled(false);
          setStatus(geolocationMessage(error));
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
    const hidden = () => {
      if (document.visibilityState !== "visible") {
        stop();
        setEnabled(false);
        setStatus(
          "Live location stopped when this tab became hidden. Enable it again to resume.",
        );
      }
    };
    const end = () => {
      stop();
      setEnabled(false);
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", end);
    window.addEventListener("fluid:session-ended", end);
    window.addEventListener("storage", end);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", end);
      window.removeEventListener("fluid:session-ended", end);
      window.removeEventListener("storage", end);
    };
  }, [enabled, stop]);
  const toggle = (checked: boolean) => {
    if (!checked) {
      stop();
      setEnabled(false);
      setStatus("Live location stopped.");
      return;
    }
    if (!latest.current?.confirmed_at || !latest.current?.address) {
      setStatus("Confirm and save your location before enabling live updates.");
      return;
    }
    setStatus("Requesting GPS permission for this visible session only…");
    setEnabled(true);
  };
  return { enabled, status, toggle };
}
