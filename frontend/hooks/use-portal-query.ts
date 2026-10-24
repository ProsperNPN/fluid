"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSessionScope, subscribeSession } from '@/lib/api/token-storage';
import { getApiErrorMessage } from "@/lib/api";

/** Refreshes visible workspaces without replacing current content with skeletons. */
export function usePortalQuery<T>(loader: () => Promise<T>, interval = 15000) {
  const scope = useSyncExternalStore(subscribeSession, getSessionScope, () => '');
  const [resultScope, setResultScope] = useState(scope);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    const startedScope = getSessionScope();
    try {
      const result = await loader();
      if (id === sequence.current && startedScope === getSessionScope()) {
        setResultScope(startedScope);
        setData(result);
        setError(null);
      }
    } catch (failure) {
      if (id === sequence.current && startedScope === getSessionScope()) {
        setResultScope(startedScope);
        setError(
          getApiErrorMessage(
            failure,
            "Unable to refresh this workspace. Please try again.",
          ),
        );
      }
    } finally {
      if (id === sequence.current && startedScope === getSessionScope()) setLoading(false);
    }
  }, [loader, scope]);
  useEffect(() => {
    setData(null);
    setError(null);
    setLoading(true);
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, interval);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    window.addEventListener("fluid:location-updated", visible);
    window.addEventListener("fluid:live-update", visible);
    return () => {
      sequence.current++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
      window.removeEventListener("fluid:location-updated", visible);
      window.removeEventListener("fluid:live-update", visible);
    };
  }, [refresh, interval]);
  return { data: resultScope === scope ? data : null, loading: resultScope !== scope || loading, error: resultScope === scope ? error : null, refresh };
}
