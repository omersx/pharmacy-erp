"use client";

import { useEffect, useState, useCallback } from "react";
import { useCurrentLocale } from "@/hooks/use-locale";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA Install Button for Chromium browsers.
 * Captures the beforeinstallprompt event and shows a localized install button.
 */
export function InstallButton({ className = "" }: { className?: string }) {
  const { isAr } = useCurrentLocale();
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone
    ) {
      setIsInstalled(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsInstalled(true);
    }
  }, [deferredPrompt]);

  if (isInstalled || !deferredPrompt) return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg
                 bg-teal-600 text-white hover:bg-teal-700 transition-colors
                 shadow-sm hover:shadow-md select-none ${className}`}
      title={isAr ? "تثبيت تطبيق الصيدلية على جهازك" : "Install Pharmacy ERP on your device"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span>{isAr ? "تثبيت التطبيق" : "Install App"}</span>
    </button>
  );
}
