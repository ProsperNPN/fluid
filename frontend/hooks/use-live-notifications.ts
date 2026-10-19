"use client";
import { useEffect, useState } from "react";
import { apiClient, getAccessToken } from "@/lib/api";

/** Authenticated SSE; database state polling remains available behind proxies. */
export function useLiveNotifications(enabled: boolean) {
  const [status, setStatus] = useState("Connecting");
  useEffect(() => {
    if (!enabled) return;
    let disposed = false,
      revision = "",
      failures = 0;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (next: string) => {
      if (next !== revision) {
        revision = next;
        window.dispatchEvent(new Event("fluid:live-update"));
      }
    };
    const connect = async () => {
      if (disposed || document.hidden || !navigator.onLine || !getAccessToken())
        return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      try {
        // Axios performs the existing serialized refresh flow before opening SSE.
        const state = await apiClient.get<{ revision: string }>(
          "/api/v1/notifications/state",
        );
        if (signal.aborted || disposed) return;
        update(state.data.revision);
        const base = (
          process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
        ).replace(/\/$/, "");
        const response = await fetch(`${base}/api/v1/notifications/stream`, {
          headers: {
            Authorization: `Bearer ${getAccessToken()}`,
            Accept: "text/event-stream",
          },
          signal,
          cache: "no-store",
        });
        if (!response.ok || !response.body)
          throw new Error("Stream unavailable");
        setStatus("Live");
        failures = 0;
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let buffer = "";
        while (!signal.aborted && !disposed) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder
            .decode(chunk.value, { stream: true })
            .replace(/\r\n/g, "\n");
          let end: number;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = event
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (data)
              update(
                (JSON.parse(data.slice(6)) as { revision: string }).revision,
              );
          }
        }
      } catch {
        if (!signal.aborted && !disposed) {
          failures++;
          setStatus("Polling · reconnecting");
        }
      } finally {
        if (!signal.aborted && !disposed)
          timer = setTimeout(
            () => void connect(),
            Math.min(30000, 1000 * 2 ** Math.min(failures, 5)),
          );
      }
    };
    const stop = () => {
      controller?.abort();
      clearTimeout(timer);
    };
    const resume = () => {
      stop();
      if (document.hidden) setStatus("Paused");
      else if (!navigator.onLine) setStatus("Offline");
      else void connect();
    };
    const ended = () => {
      disposed = true;
      stop();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === "fluid.access_token") resume();
    };
    const poll = setInterval(() => {
      if (!disposed && !document.hidden && navigator.onLine && getAccessToken())
        void apiClient
          .get<{ revision: string }>("/api/v1/notifications/state")
          .then((r) => {
            if (!disposed) update(r.data.revision);
          })
          .catch(() => setStatus("Offline · retrying"));
    }, 15000);
    void connect();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    window.addEventListener("fluid:session-ended", ended);
    window.addEventListener("storage", storage);
    return () => {
      disposed = true;
      stop();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      window.removeEventListener("fluid:session-ended", ended);
      window.removeEventListener("storage", storage);
    };
  }, [enabled]);
  return status;
}
