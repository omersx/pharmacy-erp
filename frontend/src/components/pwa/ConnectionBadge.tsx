"use client";

import { useEffect, useState } from "react";
import { isReachable, subscribeReachability } from "@/lib/offline/reachability";
import { useCurrentLocale } from "@/hooks/use-locale";

type ConnectionStatus = "online" | "offline";

/**
 * Displays a badge showing the current connection status.
 * Uses both navigator.onLine and a real reachability probe.
 * Fully localized for Arabic and English.
 */
export function ConnectionBadge({ className = "" }: { className?: string }) {
  const { isAr } = useCurrentLocale();
  const [status, setStatus] = useState<ConnectionStatus>("online");

  useEffect(() => {
    // Subscribe to shared reachability updates
    const unsubscribe = subscribeReachability((online) => {
      setStatus(online ? "online" : "offline");
    });

    const check = async () => {
      const ok = await isReachable();
      setStatus(ok ? "online" : "offline");
    };

    check();

    window.addEventListener("online", check);
    window.addEventListener("offline", () => setStatus("offline"));

    const interval = setInterval(check, 30_000);

    return () => {
      unsubscribe();
      window.removeEventListener("online", check);
      window.removeEventListener("offline", () => setStatus("offline"));
      clearInterval(interval);
    };
  }, []);

  const label =
    status === "online"
      ? isAr
        ? "متصل"
        : "Online"
      : isAr
      ? "غير متصل"
      : "Offline";

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors select-none ${
        status === "online"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      } ${className}`}
      role="status"
      aria-live="polite"
      title={
        status === "online"
          ? isAr
            ? "الخادم متاح ومتصل"
            : "Server reachable & connected"
          : isAr
          ? "الخادم غير متاح حالياً (وضع عدم الاتصال)"
          : "Server unreachable (Offline mode)"
      }
    >
      <span
        className={`w-2 h-2 rounded-full ${
          status === "online"
            ? "bg-emerald-500 animate-pulse"
            : "bg-amber-500"
        }`}
      />
      <span>{label}</span>
    </div>
  );
}
