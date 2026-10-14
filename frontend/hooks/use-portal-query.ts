"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "@/lib/api";

/** Refreshes visible workspaces without replacing current content with skeletons. */
export function usePortalQuery<T>(loader: () => Promise<T>, interval = 15000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const result = await loader();
      if (id === sequence.current) {
        setData(result);
        setError(null);
      }
    } catch (failure) {
      if (id === sequence.current)
        setError(
          getApiErrorMessage(
            failure,
            "Unable to refresh this workspace. Please try again.",
          ),
        );
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, [loader]);
  useEffect(() => {
    setLoading(true);
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, interval);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      sequence.current++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, interval]);
  return { data, loading, error, refresh };
}
