import { db, type OutboxSale, type SaleStatus } from "./db";
import { isReachable } from "./reachability";

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 8;

const broadcast =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel("pharmacy-sync")
    : null;

/**
 * Calculates exponential backoff with jitter
 */
function getBackoffMs(attempts: number): number {
  return (
    Math.min(5000 * Math.pow(2, attempts), 10 * 60 * 1000) +
    Math.random() * 1000
  );
}

/**
 * Retrieves or lazily creates a stable client Device ID
 */
export async function getDeviceId(): Promise<string> {
  if (typeof window === "undefined") return "00000000-0000-0000-0000-000000000000";

  let meta = await db.meta.get("device_id");
  if (!meta || !meta.value) {
    const newId = crypto.randomUUID();
    await db.meta.put({ key: "device_id", value: newId });
    return newId;
  }
  return String(meta.value);
}

/**
 * Updates application badge (Chromium desktop & Android)
 */
async function updateAppBadge(pendingCount: number) {
  if (typeof window === "undefined" || !("setAppBadge" in navigator)) return;
  try {
    if (pendingCount > 0) {
      await (navigator as any).setAppBadge(pendingCount);
    } else {
      await (navigator as any).clearAppBadge();
    }
  } catch {}
}

/**
 * Executes a single synchronization run across queued offline sales
 */
export async function runSync(): Promise<{ syncedCount: number; pendingCount: number }> {
  const reachable = await isReachable();
  if (!reachable) {
    const pending = await db.outbox.where("status").equals("pending").count();
    return { syncedCount: 0, pendingCount: pending };
  }

  let totalSynced = 0;

  // Single-tab execution guarantee using Web Locks API
  const acquireLock = async (fn: () => Promise<void>) => {
    if (typeof window !== "undefined" && "locks" in navigator) {
      await (navigator as any).locks.request("pharmacy-sync", { ifAvailable: true }, async (lock: any) => {
        if (!lock) return;
        await fn();
      });
    } else {
      await fn();
    }
  };

  await acquireLock(async () => {
    const now = Date.now();
    const dueSales = await db.outbox
      .where("status")
      .anyOf("pending", "failed")
      .filter((s) => s.nextAttemptAt <= now)
      .sortBy("createdAtDevice");

    if (dueSales.length === 0) return;

    const deviceId = await getDeviceId();

    for (let i = 0; i < dueSales.length; i += BATCH_SIZE) {
      const chunk = dueSales.slice(i, i + BATCH_SIZE);

      // Mark batch as syncing
      await db.outbox.bulkPut(
        chunk.map((s) => ({ ...s, status: "syncing" as SaleStatus }))
      );

      try {
        const payload = {
          device_id: deviceId,
          client_version: "1.3.4",
          items: chunk.map((s) => ({
            client_sale_id: s.id,
            branch_id: s.branchId,
            cashier_id: s.cashierId,
            cash_session_id: s.cashSessionId || undefined,
            created_at_device: s.createdAtDevice,
            provisional_no: s.provisionalNo,
            lines: s.payload.lines.map((l) => ({
              medicine_id: l.medicineId,
              batch_hint_id: l.batchHintId,
              qty: l.qty,
              unit_price: l.unitPrice,
              discount: l.discount,
              tax_rate: l.taxRate,
              price_version: l.priceVersion,
            })),
            payments: s.payload.payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference,
            })),
            totals: s.payload.totals,
            customer_id: s.payload.customerId,
          })),
        };

        const res = await fetch("/api/v1/sync/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        if (res.status === 401) {
          // Revert to pending on auth expiration, never drop sales
          await db.outbox.bulkPut(
            chunk.map((s) => ({ ...s, status: "pending" as SaleStatus }))
          );
          return;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const resultsMap = new Map<string, any>();
        (data.results || []).forEach((r: any) => {
          resultsMap.set(String(r.client_sale_id), r);
        });

        // Apply results per item
        for (const sale of chunk) {
          const resItem = resultsMap.get(sale.id);
          if (!resItem) continue;

          if (resItem.status === "created" || resItem.status === "duplicate") {
            await db.outbox.update(sale.id, {
              status: "synced",
              serverInvoiceNo: resItem.invoice_no,
              warnings: resItem.warnings,
            });
            totalSynced++;
          } else if (resItem.status === "needs_review") {
            await db.outbox.update(sale.id, {
              status: "needs_review",
              serverInvoiceNo: resItem.invoice_no,
              warnings: resItem.warnings,
              lastError: resItem.reason,
            });
          } else if (resItem.status === "rejected") {
            await db.outbox.update(sale.id, {
              status: "failed",
              lastError: resItem.reason || "Rejected by server",
            });
          }
        }
      } catch (err: any) {
        // Backoff and schedule retry
        await db.outbox.bulkPut(
          chunk.map((s) => {
            const nextAttempts = s.attempts + 1;
            const isPoison = nextAttempts >= MAX_ATTEMPTS;
            return {
              ...s,
              status: isPoison ? ("needs_review" as SaleStatus) : ("failed" as SaleStatus),
              attempts: nextAttempts,
              nextAttemptAt: Date.now() + getBackoffMs(nextAttempts),
              lastError: isPoison ? "Max sync attempts exceeded" : String(err),
            };
          })
        );
      }
    }
  });

  const remainingPending = await db.outbox
    .where("status")
    .anyOf("pending", "syncing", "failed")
    .count();

  await updateAppBadge(remainingPending);

  // Notify other browser tabs
  broadcast?.postMessage({
    type: "SYNC_COMPLETED",
    syncedCount: totalSynced,
    pendingCount: remainingPending,
  });

  return { syncedCount: totalSynced, pendingCount: remainingPending };
}

/**
 * Initializes automatic background sync listeners
 */
export function initAutoSync(): () => void {
  if (typeof window === "undefined") return () => {};

  const trigger = () => {
    runSync().catch((err) => console.warn("[AutoSync] Error during sync run:", err));
  };

  // Immediate run on startup
  trigger();

  window.addEventListener("online", trigger);

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") trigger();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Periodic timer every 30 seconds
  const interval = setInterval(trigger, 30_000);

  return () => {
    window.removeEventListener("online", trigger);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    clearInterval(interval);
  };
}
