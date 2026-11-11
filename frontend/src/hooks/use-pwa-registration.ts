"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount.
 * Call this once in the root layout.
 */
export function usePwaRegistration() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV === "development"
    ) {
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Check for updates on page focus
        const checkUpdate = () => {
          registration.update().catch(() => {
            // Silently ignore update check failures
          });
        };

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            checkUpdate();
          }
        });

        console.log("[PWA] Service worker registered successfully");
      } catch (error) {
        console.error("[PWA] Service worker registration failed:", error);
      }
    };

    // Register after the page has loaded
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);
}
