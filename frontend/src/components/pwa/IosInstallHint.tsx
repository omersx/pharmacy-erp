"use client";

import { useEffect, useState } from "react";

/**
 * iOS Safari install instructions card.
 * Shows only on iOS Safari when the app is NOT already installed.
 */
export function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone;

    const isSafari =
      /Safari/.test(navigator.userAgent) &&
      !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);

    // Only show on iOS Safari when not already installed
    if (isIos && isSafari && !isStandalone) {
      // Check if user dismissed it before
      const dismissed = localStorage.getItem("pwa-ios-hint-dismissed");
      if (!dismissed) {
        setShow(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem("pwa-ios-hint-dismissed", "true");
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm animate-in slide-in-from-bottom-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1.5">
              تثبيت التطبيق على جهازك
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 leading-relaxed" dir="rtl">
              اضغط على{" "}
              <span className="inline-flex items-center gap-0.5 font-medium text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                مشاركة
              </span>{" "}
              ثم{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                &ldquo;إضافة إلى الشاشة الرئيسية&rdquo;
              </span>
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed" dir="ltr">
              Tap{" "}
              <span className="font-medium text-blue-600">Share</span> →{" "}
              <span className="font-medium text-gray-600 dark:text-gray-300">
                Add to Home Screen
              </span>
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Dismiss"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
