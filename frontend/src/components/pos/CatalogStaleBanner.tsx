"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/offline/db";
import { syncCatalog } from "@/lib/offline/catalog-sync";
import { AlertTriangle, RefreshCw, X } from "lucide-react";

interface CatalogStaleBannerProps {
  branchId?: string;
  onSynced?: () => void;
}

export function CatalogStaleBanner({ branchId, onSynced }: CatalogStaleBannerProps) {
  const [staleState, setStaleState] = useState<"fresh" | "warning" | "danger">("fresh");
  const [hoursOld, setHoursOld] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkStaleness = async () => {
    try {
      const meta = await db.meta.get("catalog_last_synced");
      if (!meta || !meta.value) {
        // Never synced
        setStaleState("warning");
        setHoursOld(24);
        return;
      }

      const lastDate = new Date(meta.value as string);
      const diffMs = Date.now() - lastDate.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      setHoursOld(diffHours);

      if (diffHours >= 72) {
        setStaleState("danger");
      } else if (diffHours >= 24) {
        setStaleState("warning");
      } else {
        setStaleState("fresh");
      }
    } catch {
      setStaleState("fresh");
    }
  };

  useEffect(() => {
    checkStaleness();
    const interval = setInterval(checkStaleness, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const ok = await syncCatalog(branchId);
      if (ok) {
        await checkStaleness();
        onSynced?.();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  if (dismissed || staleState === "fresh") return null;

  const isDanger = staleState === "danger";

  return (
    <div
      className={`px-3 py-1.5 text-xs flex items-center justify-between transition-colors border-b ${
        isDanger
          ? "bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-400"
          : "bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-300"
      }`}
      role="alert"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="shrink-0" />
        <span>
          {isDanger
            ? `⚠️ تنبيه: بيانات الأدوية والأسعار غير محدثة منذ أكثر من ${hoursOld} ساعة!`
            : `تنبيه: تم تحديث الكتالوج منذ ${hoursOld} ساعة.`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="inline-flex items-center gap-1 font-semibold underline hover:no-underline disabled:opacity-50"
        >
          <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? "جاري التحديث..." : "تحديث الكتالوج الآن"}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-0.5 hover:opacity-75 transition-opacity"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
