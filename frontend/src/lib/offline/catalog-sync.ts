import { db, type MedicineLite, type BatchLite } from "./db";
import { normalizeArabicLatin } from "./search";
import { isReachable } from "./reachability";
import { requestPersistentStorage } from "./storage";

export interface CatalogSyncProgress {
  state: "idle" | "bootstrapping" | "syncing" | "error" | "complete";
  total?: number;
  processed?: number;
  lastSyncTime?: Date;
  errorMessage?: string;
}

type SyncListener = (progress: CatalogSyncProgress) => void;
const listeners = new Set<SyncListener>();

let currentProgress: CatalogSyncProgress = { state: "idle" };

function updateProgress(patch: Partial<CatalogSyncProgress>) {
  currentProgress = { ...currentProgress, ...patch };
  listeners.forEach((fn) => fn(currentProgress));
}

export function subscribeCatalogSync(fn: SyncListener): () => void {
  listeners.add(fn);
  fn(currentProgress);
  return () => listeners.delete(fn);
}

/**
 * Syncs catalog data from the server into IndexedDB.
 * Supports incremental delta updates if a valid cursor exists,
 * or full bootstrap snapshot.
 */
export async function syncCatalog(
  branchId?: string,
  options?: { forceBootstrap?: boolean }
): Promise<boolean> {
  const reachable = await isReachable();
  if (!reachable) {
    updateProgress({ state: "error", errorMessage: "Offline" });
    return false;
  }

  updateProgress({ state: "syncing" });

  try {
    const existingCursor = options?.forceBootstrap
      ? null
      : await db.meta.get("catalog_cursor");

    // If we have a cursor and not forcing bootstrap, attempt delta sync
    if (existingCursor && existingCursor.value) {
      try {
        const deltaUrl = `/api/v1/catalog/delta?since=${encodeURIComponent(
          String(existingCursor.value)
        )}${branchId ? `&branch_id=${branchId}` : ""}`;
        const res = await fetch(deltaUrl, { cache: "no-store" });
        if (res.ok) {
          const deltaData = await res.json();
          await applyDelta(deltaData);

          const now = new Date();
          await db.meta.put({ key: "catalog_last_synced", value: now.toISOString() });
          await requestPersistentStorage();
          updateProgress({ state: "complete", lastSyncTime: now });
          return true;
        }
      } catch (deltaErr) {
        console.warn("[CatalogSync] Delta sync failed, falling back to bootstrap:", deltaErr);
      }
    }

    // Attempt bootstrap snapshot
    let bootstrapData: any = null;
    try {
      const res = await fetch(
        `/api/v1/catalog/bootstrap${branchId ? `?branch_id=${branchId}` : ""}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        bootstrapData = await res.json();
      }
    } catch {
      // Endpoint not deployed yet, proceed to fallback
    }

    if (bootstrapData && Array.isArray(bootstrapData.medicines)) {
      await applyBootstrap(bootstrapData);
    } else {
      // Graceful fallback to existing medicines endpoint
      await fallbackSyncFromExistingEndpoints();
    }

    const now = new Date();
    await db.meta.put({ key: "catalog_last_synced", value: now.toISOString() });
    await requestPersistentStorage();

    updateProgress({ state: "complete", lastSyncTime: now });
    return true;
  } catch (err: any) {
    console.error("[CatalogSync] Error syncing catalog:", err);
    updateProgress({ state: "error", errorMessage: err?.message || String(err) });
    return false;
  }
}

/**
 * Applies an incremental delta snapshot to IndexedDB, including tombstone deletes
 */
async function applyDelta(data: {
  medicines: any[];
  batches?: any[];
  deleted_medicine_ids?: string[];
  cursor?: string;
}) {
  const medicines: MedicineLite[] = (data.medicines || []).map((m) => {
    const nameAr = m.name_ar || m.nameAr || m.name || "";
    const nameEn = m.name_en || m.nameEn || m.name || "";
    return {
      id: String(m.id),
      barcode: m.barcode || undefined,
      gtin: m.gtin || undefined,
      nameAr,
      nameEn,
      nameNorm: normalizeArabicLatin(`${nameAr} ${nameEn}`),
      genericNorm: m.generic_name ? normalizeArabicLatin(m.generic_name) : undefined,
      strength: m.strength || undefined,
      form: m.dosage_form || m.form || undefined,
      price: String(m.selling_price ?? m.price ?? "0"),
      taxRate: String(m.tax_rate ?? "0"),
      controlled: Boolean(m.is_controlled || m.controlled),
      requiresRx: Boolean(m.requires_prescription || m.requiresRx),
      priceVersion: Number(m.price_version ?? 1),
      updatedAt: m.updated_at || new Date().toISOString(),
    };
  });

  const batches: BatchLite[] = (data.batches || []).map((b) => ({
    id: String(b.id),
    medicineId: String(b.medicine_id || b.medicineId),
    branchId: String(b.branch_id || b.branchId || ""),
    batchNo: b.batch_number || b.batchNo || "",
    expiry: b.expiry_date || b.expiry || "",
    qty: String(b.quantity ?? b.qty ?? "0"),
    updatedAt: b.updated_at || new Date().toISOString(),
  }));

  const deletedIds = (data.deleted_medicine_ids || []).map((id) => String(id));

  await db.transaction("rw", [db.medicines, db.batches, db.meta], async () => {
    if (deletedIds.length > 0) {
      await db.medicines.bulkDelete(deletedIds);
      // Remove batches for deleted medicines
      await db.batches.where("medicineId").anyOf(deletedIds).delete();
    }
    if (medicines.length > 0) {
      await db.medicines.bulkPut(medicines);
    }
    if (batches.length > 0) {
      await db.batches.bulkPut(batches);
    }
    if (data.cursor) {
      await db.meta.put({ key: "catalog_cursor", value: data.cursor });
    }
  });
}

/**
 * Clears the local IndexedDB catalog cache
 */
export async function clearCatalogCache(): Promise<void> {
  await db.transaction("rw", [db.medicines, db.batches, db.meta], async () => {
    await db.medicines.clear();
    await db.batches.clear();
    await db.meta.delete("catalog_last_synced");
    await db.meta.delete("catalog_cursor");
  });
}

async function applyBootstrap(data: {
  medicines: any[];
  batches?: any[];
  cursor?: string;
}) {
  const medicines: MedicineLite[] = data.medicines.map((m) => {
    const nameAr = m.name_ar || m.nameAr || m.name || "";
    const nameEn = m.name_en || m.nameEn || m.name || "";
    return {
      id: String(m.id),
      barcode: m.barcode || undefined,
      gtin: m.gtin || undefined,
      nameAr,
      nameEn,
      nameNorm: normalizeArabicLatin(`${nameAr} ${nameEn}`),
      genericNorm: m.generic_name ? normalizeArabicLatin(m.generic_name) : undefined,
      strength: m.strength || undefined,
      form: m.dosage_form || m.form || undefined,
      price: String(m.selling_price ?? m.price ?? "0"),
      taxRate: String(m.tax_rate ?? "0"),
      controlled: Boolean(m.is_controlled || m.controlled),
      requiresRx: Boolean(m.requires_prescription || m.requiresRx),
      priceVersion: Number(m.price_version ?? 1),
      updatedAt: m.updated_at || new Date().toISOString(),
    };
  });

  const batches: BatchLite[] = (data.batches || []).map((b) => ({
    id: String(b.id),
    medicineId: String(b.medicine_id || b.medicineId),
    branchId: String(b.branch_id || b.branchId || ""),
    batchNo: b.batch_number || b.batchNo || "",
    expiry: b.expiry_date || b.expiry || "",
    qty: String(b.quantity ?? b.qty ?? "0"),
    updatedAt: b.updated_at || new Date().toISOString(),
  }));

  await db.transaction("rw", [db.medicines, db.batches, db.meta], async () => {
    await db.medicines.bulkPut(medicines);
    if (batches.length > 0) {
      await db.batches.bulkPut(batches);
    }
    if (data.cursor) {
      await db.meta.put({ key: "catalog_cursor", value: data.cursor });
    }
  });
}

async function fallbackSyncFromExistingEndpoints() {
  const res = await fetch("/api/v1/medicines?limit=2000", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = await res.json();
  const list = Array.isArray(items) ? items : items.items || [];

  const medicines: MedicineLite[] = list.map((m: any) => {
    const nameAr = m.name_ar || m.name || "";
    const nameEn = m.name_en || m.name || "";
    return {
      id: String(m.id),
      barcode: m.barcode || undefined,
      gtin: m.gtin || undefined,
      nameAr,
      nameEn,
      nameNorm: normalizeArabicLatin(`${nameAr} ${nameEn}`),
      genericNorm: m.generic_name ? normalizeArabicLatin(m.generic_name) : undefined,
      strength: m.strength || undefined,
      form: m.dosage_form || undefined,
      price: String(m.selling_price ?? "0"),
      taxRate: String(m.tax_rate ?? "0"),
      controlled: Boolean(m.is_controlled),
      requiresRx: Boolean(m.requires_prescription),
      priceVersion: 1,
      updatedAt: m.updated_at || new Date().toISOString(),
    };
  });

  await db.transaction("rw", [db.medicines, db.meta], async () => {
    await db.medicines.bulkPut(medicines);
  });
}

/**
 * Searches offline medicines from Dexie IndexedDB using normalized Arabic & Latin query.
 */
export async function searchOfflineMedicines(query: string, limit = 50): Promise<MedicineLite[]> {
  const clean = query.trim();
  if (!clean) return [];

  const normQuery = normalizeArabicLatin(clean);

  // Exact barcode match (indexed)
  const byBarcode = await db.medicines.where("barcode").equals(clean).first();
  if (byBarcode) return [byBarcode];

  // Prefix match on normalized name
  const prefixMatches = await db.medicines
    .where("nameNorm")
    .startsWith(normQuery)
    .limit(limit)
    .toArray();

  if (prefixMatches.length >= limit) return prefixMatches;

  // Substring search on medicines table
  const all = await db.medicines.limit(500).toArray();
  const tokens = normQuery.split(" ").filter(Boolean);

  const additional = all.filter((med) => {
    if (prefixMatches.some((p) => p.id === med.id)) return false;
    return tokens.every(
      (token) =>
        med.nameNorm.includes(token) ||
        (med.genericNorm && med.genericNorm.includes(token)) ||
        (med.barcode && med.barcode.includes(clean))
    );
  });

  return [...prefixMatches, ...additional].slice(0, limit);
}
