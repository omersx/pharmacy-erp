/**
 * Reachability probe
 *
 * `navigator.onLine` only indicates whether a network interface exists (can return true
 * on captive portals, dead routers, or when server is down).
 * This module tests actual reachability to the backend server with an abort timeout.
 */

let lastReachable = true;
const listeners = new Set<(online: boolean) => void>();

export function subscribeReachability(listener: (online: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(online: boolean) {
  if (lastReachable !== online) {
    lastReachable = online;
    listeners.forEach((fn) => fn(online));
  }
}

/**
 * Probes the backend server to check if it's genuinely reachable.
 */
export async function isReachable(timeoutMs = 4000): Promise<boolean> {
  if (typeof window === "undefined") return true;
  if (!navigator.onLine) {
    notify(false);
    return false;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Ping health endpoint or lightweight API route
    const res = await fetch("/api/v1/health/live", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const reachable = res.ok;
    notify(reachable);
    return reachable;
  } catch {
    // If the specific health endpoint is 404 or fails, try testing origin root
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch("/", {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      const reachable = res.ok;
      notify(reachable);
      return reachable;
    } catch {
      notify(false);
      return false;
    }
  }
}
