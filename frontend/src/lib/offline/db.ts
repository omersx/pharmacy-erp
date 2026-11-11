import Dexie, { type Table } from "dexie";

export interface MedicineLite {
  id: string;
  barcode?: string;
  gtin?: string;
  nameAr: string;
  nameEn: string;
  nameNorm: string;        // normalized (Arabic/Latin) for search
  genericNorm?: string;
  strength?: string;
  form?: string;
  price: string;           // Decimal as string (never floats)
  taxRate: string;
  controlled: boolean;     // controlled/Rx flag → never sellable offline
  requiresRx: boolean;
  priceVersion: number;
  updatedAt: string;
}

export interface BatchLite {
  id: string;
  medicineId: string;
  branchId: string;
  batchNo: string;
  expiry: string;          // ISO date YYYY-MM-DD
  qty: string;             // advisory only offline
  updatedAt: string;
}

export type SaleStatus = "pending" | "syncing" | "synced" | "failed" | "needs_review";

export interface OutboxSale {
  id: string;                 // client_sale_id (UUIDv7 or UUIDv4)
  deviceId: string;
  branchId: string;
  cashierId: string;
  cashSessionId: string;
  createdAtDevice: string;    // ISO timestamp from device clock
  clockOffsetMs?: number;     // last known server-minus-device offset
  provisionalNo: string;      // e.g., "D3-000123" (device prefix + local sequence)
  payload: {
    lines: Array<{
      medicineId: string;
      batchHintId?: string;
      qty: string;
      unitPrice: string;
      discount: string;
      taxRate: string;
      priceVersion: number;
    }>;
    payments: Array<{
      method: "cash" | "card" | "other";
      amount: string;
      reference?: string;
    }>;
    customerId?: string;
    totals: {
      subtotal: string;
      tax: string;
      discount: string;
      total: string;
    };
  };
  signature?: string;         // optional device signature
  status: SaleStatus;
  attempts: number;
  nextAttemptAt: number;      // epoch ms
  lastError?: string;
  serverInvoiceNo?: string;
  warnings?: string[];
}

export interface MetaItem {
  key: string;
  value: unknown;
}

export class OfflineDB extends Dexie {
  medicines!: Table<MedicineLite, string>;
  batches!: Table<BatchLite, string>;
  outbox!: Table<OutboxSale, string>;
  meta!: Table<MetaItem, string>;

  constructor() {
    super("pharmacy-offline");
    this.version(1).stores({
      medicines: "id, barcode, gtin, nameNorm, genericNorm, updatedAt",
      batches: "id, medicineId, expiry, [medicineId+expiry]",
      outbox: "id, status, nextAttemptAt, createdAtDevice",
      meta: "key",
    });
  }
}

export const db = new OfflineDB();
