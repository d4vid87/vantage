"use client";

import { useEffect, useState, useCallback } from "react";
export function useDashboardFeed<T>(url: string | null, interval = 60000) {
  const [result, setResult] = useState<{
    url: string;
    data: T | null;
    error: string;
  }>({
    url: "",
    data: null,
    error: "",
  });
  const [revision, retry] = useState(0);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let running = false;
    async function load() {
      if (document.hidden || running) return;
      running = true;
      try {
        const r = await fetch(url!, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        if (!controller.signal.aborted)
          setResult({
            url: url!,
            data,
            error: "",
          });
      } catch (e) {
        if (!controller.signal.aborted)
          setResult((old) => ({
            url: url!,
            data: old.url === url ? old.data : null,
            error: e instanceof Error ? e.message : "Request failed",
          }));
      } finally {
        running = false;
      }
    }
    void load();
    const timer = setInterval(load, interval);
    document.addEventListener("visibilitychange", load);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [url, interval, revision]);
  return {
    data: result.url === url ? result.data : null,
    error: result.url === url ? result.error : "",
    retry: useCallback(() => retry((n) => n + 1), []),
  };
}
