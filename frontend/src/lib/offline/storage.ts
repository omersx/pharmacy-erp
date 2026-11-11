/**
 * Browser persistent storage and quota helpers
 * Conforms to PWA implementation guide §6.4 & §10.
 */

export interface StorageHealth {
  usageMb: number;
  quotaMb: number;
  percentUsed: number;
  persisted: boolean;
}

/**
 * Requests that the browser preserve storage against eviction.
 * Essential on iOS/Safari and low-disk devices.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.storage?.persist) {
    return false;
  }

  try {
    const isAlreadyPersisted = await navigator.storage.persisted();
    if (isAlreadyPersisted) return true;

    const granted = await navigator.storage.persist();
    return granted;
  } catch (err) {
    console.warn("[PWA Storage] Failed to request persistent storage:", err);
    return false;
  }
}

/**
 * Retrieves storage usage and quota estimates in megabytes.
 */
export async function getStorageHealth(): Promise<StorageHealth | null> {
  if (typeof window === "undefined" || !navigator.storage?.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted
      ? await navigator.storage.persisted()
      : false;

    const usageMb = estimate.usage ? Math.round((estimate.usage / (1024 * 1024)) * 10) / 10 : 0;
    const quotaMb = estimate.quota ? Math.round((estimate.quota / (1024 * 1024)) * 10) / 10 : 0;
    const percentUsed = quotaMb > 0 ? Math.round((usageMb / quotaMb) * 100) : 0;

    return {
      usageMb,
      quotaMb,
      percentUsed,
      persisted,
    };
  } catch (err) {
    console.warn("[PWA Storage] Failed to get storage estimate:", err);
    return null;
  }
}
