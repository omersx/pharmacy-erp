"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Update banner that appears when a new service worker version is available.
 * The user must explicitly accept the update (never auto-swap mid-session).
 */
export function UpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null
  );
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onControllerChange = () => {
      window.location.reload();
    };

    const registerAndWatch = async () => {
      const registration = await navigator.serviceWorker.ready;

      // Check if there's already a waiting worker
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
      }

      // Listen for new updates
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            // New version available
            setWaitingWorker(installing);
          }
        });
      });

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange
      );
    };

    registerAndWatch();

    return () => {
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  const handleUpdate = useCallback(() => {
    if (!waitingWorker) return;
    setIsUpdating(true);
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }, [waitingWorker]);

  const handleDismiss = () => {
    setWaitingWorker(null);
  };

  if (!waitingWorker) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md">
      <div className="bg-blue-600 text-white rounded-xl shadow-2xl p-4 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold">تحديث جديد متوفر</p>
          <p className="text-xs text-blue-100 mt-0.5">
            A new version is available
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-blue-500 transition-colors"
          >
            لاحقاً
          </button>
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-blue-600 
                       hover:bg-blue-50 transition-colors disabled:opacity-70"
          >
            {isUpdating ? "جاري التحديث..." : "تحديث الآن"}
          </button>
        </div>
      </div>
    </div>
  );
}
