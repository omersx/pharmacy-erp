import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  NetworkOnly,
  StaleWhileRevalidate,
  ExpirationPlugin,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: WorkerGlobalScope & typeof globalThis;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // never swap code under a cashier mid-sale
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 1) Auth and anything sensitive: NEVER cache
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/v1/auth"),
      handler: new NetworkOnly(),
    },

    // 2) Non-sensitive reference data (catalog snapshot endpoint) – SWR, short TTL
    {
      matcher: ({ url, request }) =>
        request.method === "GET" &&
        url.pathname.startsWith("/api/v1/catalog/"),
      handler: new StaleWhileRevalidate({
        cacheName: "catalog-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 24 * 3600,
          }),
        ],
      }),
    },

    // 3) Every other API call: network only (authenticated, mutable, personal data)
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },

    // 4) Next.js static assets, fonts, images, etc.
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// Listen for skip-waiting messages from the app
self.addEventListener("message", (event: MessageEvent) => {
  if (event.data?.type === "SKIP_WAITING") (self as any).skipWaiting();
});
