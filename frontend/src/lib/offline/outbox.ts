import { db, type OutboxSale } from "./db";
import { getDeviceId, runSync } from "./sync";

export interface CreateOfflineSaleParams {
  cart: Array<{
    medicine_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    batch?: string;
    line_total?: number;
  }>;
  total: number;
  paymentMethod: string;
  payments?: Array<{
    method: "cash" | "card" | "other";
    amount: string;
    reference?: string;
  }>;
  customerId?: string;
  customerName?: string;
  cashSessionId?: string;
  branchId?: string;
  cashierId?: string;
}

export async function saveOfflineSale(params: CreateOfflineSaleParams) {
  const clientSaleId = crypto.randomUUID();
  const deviceId = await getDeviceId();
  const now = new Date();
  const provisionalNo = `PROV-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;

  const payments = params.payments && params.payments.length > 0
    ? params.payments
    : [
        {
          method: (params.paymentMethod.toLowerCase().includes("card")
            ? "card"
            : "cash") as "cash" | "card",
          amount: params.total.toFixed(2),
        },
      ];

  const outboxEntry: OutboxSale = {
    id: clientSaleId,
    deviceId,
    branchId: params.branchId || "00000000-0000-0000-0000-000000000000",
    cashierId: params.cashierId || "00000000-0000-0000-0000-000000000000",
    cashSessionId: params.cashSessionId || "00000000-0000-0000-0000-000000000000",
    createdAtDevice: now.toISOString(),
    provisionalNo,
    payload: {
      lines: params.cart.map((item) => ({
        medicineId: item.medicine_id,
        qty: String(item.quantity),
        unitPrice: String(item.unit_price),
        discount: "0.00",
        taxRate: "0.00",
        priceVersion: 1,
      })),
      payments,
      customerId: params.customerId,
      totals: {
        subtotal: params.total.toFixed(2),
        tax: "0.00",
        discount: "0.00",
        total: params.total.toFixed(2),
      },
    },
    status: "pending",
    attempts: 0,
    nextAttemptAt: Date.now(),
  };

  await db.outbox.add(outboxEntry);

  // Attempt sync immediately in background (if connection is actually fine)
  runSync().catch(() => {});

  const receiptData = {
    invoice_number: provisionalNo,
    is_offline_provisional: true,
    created_at: now.toISOString(),
    items: params.cart.map((item) => ({
      medicine_id: item.medicine_id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total || item.quantity * item.unit_price,
    })),
    total_amount: params.total,
    payment_method: `${params.paymentMethod} (مؤقت - أوفلاين)`,
    payments: payments.map((p) => ({
      payment_method: p.method.toUpperCase(),
      method_name: p.method,
      amount: Number(p.amount),
    })),
    customer: params.customerId ? { id: params.customerId, name: params.customerName || "Customer" } : null,
  };

  return {
    clientSaleId,
    provisionalNo,
    receiptData,
  };
}
