"use client";
import { useEffect } from "react";

// One request at a time. Hidden/offline tabs pause; returning to the app refreshes immediately.
export function useLiveRefresh(refresh: () => Promise<void>, scope: string, enabled = true, interval = 5000) {
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => document.visibilityState !== "hidden" && navigator.onLine !== false;
    const run = async () => {
      if (disposed || running) return;
      clearTimeout(timer);
      if (!visible()) return;
      running = true;
      try { await refresh(); } finally {
        running = false;
        if (!disposed && visible()) timer = setTimeout(() => { void run(); }, interval);
      }
    };
    const resume = () => { clearTimeout(timer); if (visible()) void run(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    void run();
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); window.removeEventListener("online", resume); window.removeEventListener("offline", resume); };
  }, [refresh, scope, enabled, interval]);
}
