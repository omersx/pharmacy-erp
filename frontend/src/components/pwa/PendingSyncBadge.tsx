"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/offline/db";
import { runSync } from "@/lib/offline/sync";
import { useCurrentLocale } from "@/hooks/use-locale";
import { CloudOff, RefreshCw } from "lucide-react";

export function PendingSyncBadge() {
  const { isAr } = useCurrentLocale();
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const refreshCount = async () => {
    try {
      const count = await db.outbox
        .where("status")
        .anyOf("pending", "syncing", "failed")
        .count();
      setPendingCount(count);
    } catch {
      setPendingCount(0);
    }
  };

  useEffect(() => {
    refreshCount();

    const channel =
      typeof window !== "undefined" && "BroadcastChannel" in window
        ? new BroadcastChannel("pharmacy-sync")
        : null;

    if (channel) {
      channel.onmessage = () => {
        refreshCount();
      };
    }

    const interval = setInterval(refreshCount, 10_000);

    return () => {
      channel?.close();
      clearInterval(interval);
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await runSync();
      await refreshCount();
    } finally {
      setIsSyncing(false);
    }
  };

  if (pendingCount === 0) return null;

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 border border-blue-500/30 text-blue-700 dark:text-blue-300 select-none">
      <CloudOff size={13} className="shrink-0 text-blue-500" />
      <span>
        {isAr
          ? `${pendingCount} مبيعات بانتظار المزامنة`
          : `${pendingCount} ${pendingCount === 1 ? "sale" : "sales"} pending sync`}
      </span>
      <button
        type="button"
        onClick={handleManualSync}
        disabled={isSyncing}
        className="ml-1 p-0.5 hover:bg-blue-500/20 rounded transition-colors"
        title={isAr ? "مزامنة الآن" : "Sync now"}
      >
        <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
