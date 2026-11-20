'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import {
  Boxes, RefreshCw, Search, Printer, CheckCircle2,
  AlertTriangle, ArrowRight, ArrowDownRight, Package,
  Layers, CheckSquare, Square, Sparkles, Filter, Clock,
  ChevronDown, X, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';

interface RefillBatch {
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  warehouse_quantity: number;
}

interface RefillSuggestion {
  medicine_id: string;
  medicine_name: string;
  medicine_sku: string;
  shelf_stock: number;
  warehouse_stock: number;
  total_stock: number;
  reorder_level: number;
  suggested_refill: number;
  status: 'EMPTY_ON_SHELF' | 'LOW_ON_SHELF' | 'OK';
  shelf_location_name?: string;
  warehouse_location_name?: string;
  unit?: string;
  available_batches: RefillBatch[];
}

export function ShelfRefillCenter({ onRefillComplete }: { onRefillComplete?: () => void }) {
  const params = useParams();
  const isAr = params?.locale === 'ar';
  const { currentBranch } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<RefillSuggestion[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'EMPTY_ON_SHELF' | 'LOW_ON_SHELF'>('ALL');
  const [isScanning, setIsScanning] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  
  // Custom quantities per medicine
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Selected items for bulk refill
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refillingId, setRefillingId] = useState<string | null>(null);

  // Single Item Modal
  const [detailModalItem, setDetailModalItem] = useState<RefillSuggestion | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [customNotes, setCustomNotes] = useState('');

  const fetchSuggestions = async () => {
    try {
      setLoading(true);
      const data = await api.getRefillSuggestions();
      setSuggestions(data || []);

      // Initialize default quantities and select all by default
      const initialQty: Record<string, number> = {};
      const initialSelected = new Set<string>();
      (data || []).forEach((item: RefillSuggestion) => {
        initialQty[item.medicine_id] = Number(item.suggested_refill || 0);
        initialSelected.add(item.medicine_id);
      });
      setQuantities(initialQty);
      setSelectedIds(initialSelected);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load shelf refill suggestions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  // Filtered list
  const filteredItems = useMemo(() => {
    return suggestions.filter(item => {
      const matchSearch =
        item.medicine_name.toLowerCase().includes(search.toLowerCase()) ||
        item.medicine_sku.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [suggestions, search, statusFilter]);

  // KPI Metrics (Numeric summation & formatting)
  const metrics = useMemo(() => {
    const emptyCount = suggestions.filter(s => s.status === 'EMPTY_ON_SHELF').length;
    const lowCount = suggestions.filter(s => s.status === 'LOW_ON_SHELF').length;
    const totalUnitsToRefill = suggestions.reduce((sum, s) => {
      const q = quantities[s.medicine_id] !== undefined ? quantities[s.medicine_id] : s.suggested_refill;
      return sum + Number(q || 0);
    }, 0);
    const totalWarehouseUnits = suggestions.reduce((sum, s) => {
      return sum + Number(s.warehouse_stock || 0);
    }, 0);
    return { emptyCount, lowCount, totalUnitsToRefill, totalWarehouseUnits };
  }, [suggestions, quantities]);

  // Quantity helpers
  const setQuantity = (medicineId: string, val: number, max: number) => {
    const clamped = Math.max(1, Math.min(val, max));
    setQuantities(prev => ({ ...prev, [medicineId]: clamped }));
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.medicine_id)));
    }
  };

  // Quick Refill Single Item
  const handleSingleRefill = async (item: RefillSuggestion) => {
    const qty = quantities[item.medicine_id] || item.suggested_refill;
    if (!qty || qty <= 0) {
      toast.error('Please enter a valid refill quantity');
      return;
    }
    try {
      setRefillingId(item.medicine_id);
      await api.quickRefill({
        medicine_id: item.medicine_id,
        quantity: qty,
        batch_id: selectedBatchId || undefined,
        notes: customNotes || undefined,
      });
      toast.success(`Refilled ${qty} ${item.unit || 'units'} of ${item.medicine_name} to shelf!`);
      setDetailModalItem(null);
      setSelectedBatchId('');
      setCustomNotes('');
      await fetchSuggestions();
      if (onRefillComplete) onRefillComplete();
    } catch (err: any) {
      toast.error(err.message || 'Refill failed');
    } finally {
      setRefillingId(null);
    }
  };

  // Bulk Refill Selected Items
  const handleBulkRefill = async () => {
    const selectedList = suggestions.filter(s => selectedIds.has(s.medicine_id));
    if (selectedList.length === 0) {
      toast.error('No items selected for refill');
      return;
    }

    const items = selectedList.map(s => ({
      medicine_id: s.medicine_id,
      quantity: quantities[s.medicine_id] || s.suggested_refill,
    })).filter(i => i.quantity > 0);

    try {
      setIsSubmitting(true);
      const res = await api.bulkRefill({ items });
      toast.success(res.message || `Successfully refilled ${items.length} items to shelf!`);
      await fetchSuggestions();
      if (onRefillComplete) onRefillComplete();
    } catch (err: any) {
      toast.error(err.message || 'Bulk refill failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Print Pick-List Window
  const handlePrintPickList = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Pop-up blocked. Please allow pop-ups to print the restock list.');
      return;
    }

    const itemsToPrint = suggestions.filter(s => selectedIds.has(s.medicine_id));
    const nowStr = new Date().toLocaleString();

    const rowsHtml = itemsToPrint.map((item, idx) => {
      const qty = quantities[item.medicine_id] || item.suggested_refill;
      const earliestBatch = item.available_batches[0];
      const expiryStr = earliestBatch ? new Date(earliestBatch.expiry_date).toLocaleDateString() : 'N/A';
      const batchNo = earliestBatch ? earliestBatch.batch_number : 'FEFO';

      return `
        <tr style="border-bottom: 1px solid #ddd; height: 36px;">
          <td style="text-align: center; width: 35px;"><input type="checkbox" style="transform: scale(1.3);" /></td>
          <td style="padding: 6px 10px; font-weight: bold;">${item.medicine_name}</td>
          <td style="padding: 6px 10px; font-family: monospace;">${item.medicine_sku}</td>
          <td style="padding: 6px 10px; text-align: center;">${batchNo} (Exp: ${expiryStr})</td>
          <td style="padding: 6px 10px; text-align: center; color: #666;">${item.shelf_stock} ${item.unit || 'units'}</td>
          <td style="padding: 6px 10px; text-align: center; font-weight: bold; font-size: 16px; color: #0284c7;">+${qty} ${item.unit || 'units'}</td>
          <td style="padding: 6px 10px; text-align: center; color: #16a34a;">${item.warehouse_stock} ${item.unit || 'units'}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Warehouse Shelf Restock Pick-List</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
            h2 { margin-bottom: 4px; }
            .meta { color: #666; font-size: 13px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #f1f5f9; padding: 10px; text-align: left; font-size: 13px; border-bottom: 2px solid #cbd5e1; }
            @media print {
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h2>📦 ${isAr ? 'أمر سحب وتعبئة الرفوف' : 'Warehouse Shelf Restock Pick-List'}</h2>
          <div class="meta">
            <span>Date: ${nowStr}</span> |
            <span>Total Items: ${itemsToPrint.length}</span> |
            <span>Warehouse ➔ Front Shelf</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>[ ]</th>
                <th>Medicine Name</th>
                <th>SKU</th>
                <th>Earliest Batch / Expiry</th>
                <th>Shelf (Before)</th>
                <th>Pick Qty (اسحب)</th>
                <th>Store Stock</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* ── Top Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between text-red-600 dark:text-red-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{isAr ? 'نفد من الرف' : 'Empty on Shelf'}</span>
            <AlertTriangle size={18} />
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400">{metrics.emptyCount}</p>
          <span className="text-xs text-muted-foreground">{isAr ? '0 على الرف الأمامي (متوفر في المستودع)' : '0 left on front shelf (stock in warehouse)'}</span>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{isAr ? 'منخفض على الرف' : 'Low on Shelf'}</span>
            <Layers size={18} />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">{metrics.lowCount}</p>
          <span className="text-xs text-muted-foreground">{isAr ? 'أقل من حد تعبئة الرف' : 'Below shelf reorder threshold'}</span>
        </div>

        <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between text-brand-600 dark:text-brand-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{isAr ? 'الوحدات المقترح تعبئتها' : 'Suggested Refill Units'}</span>
            <ArrowDownRight size={18} />
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-600 dark:text-brand-400">
            {metrics.totalUnitsToRefill.toLocaleString()}
          </p>
          <span className="text-xs text-muted-foreground">{isAr ? 'إجمالي الوحدات لنقلها للرفوف الأمامية' : 'Total units to move to front shelves'}</span>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-xs font-semibold uppercase tracking-wider">{isAr ? 'المتوفر في المستودع' : 'Available in Warehouse'}</span>
            <Boxes size={18} />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {metrics.totalWarehouseUnits.toLocaleString()}
          </p>
          <span className="text-xs text-muted-foreground">{isAr ? 'جاهز في غرفة التخزين' : 'Ready in storage room'}</span>
        </div>
      </div>

      {/* ── Toolbar & Action Bar ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {isAr ? `مساحة عمل تعبئة الرفوف (${currentBranch || 'الفرع الرئيسي'})` : `Shelf Refill Workspace (${currentBranch || 'Downtown Branch'})`}
            </h2>
            <span className="rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20 text-xs font-bold px-2.5 py-0.5">
              {filteredItems.length} {isAr ? 'بحاجة لتعبئة' : 'Needs Refill'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr ? 'إعادة التعبئة المباشرة من المستودع إلى رفوف الصرف الأمامية (صرف الأقرب انتهاءً أولاً FEFO)' : 'Direct replenishment from Back Store (Warehouse) to Front Dispensing Shelves (Strict FEFO)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Barcode Search */}
          <div className="relative">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={isAr ? "🔍 مسح الباركود أو الرمز..." : "🔍 Scan Barcode or SKU..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="rounded-xl border border-border bg-background py-2 pl-9 pr-3 rtl:pl-3 rtl:pr-9 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/20 w-56 sm:w-64"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={cn(
                "rounded-lg px-2.5 py-1 font-semibold transition-colors",
                statusFilter === 'ALL' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isAr ? `الكل (${suggestions.length})` : `All (${suggestions.length})`}
            </button>
            <button
              onClick={() => setStatusFilter('EMPTY_ON_SHELF')}
              className={cn(
                "rounded-lg px-2.5 py-1 font-semibold transition-colors flex items-center gap-1",
                statusFilter === 'EMPTY_ON_SHELF' ? "bg-red-500 text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>{isAr ? '🔴 فارغ' : '🔴 Empty'}</span>
              <span>({metrics.emptyCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('LOW_ON_SHELF')}
              className={cn(
                "rounded-lg px-2.5 py-1 font-semibold transition-colors flex items-center gap-1",
                statusFilter === 'LOW_ON_SHELF' ? "bg-amber-500 text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>{isAr ? '🟡 منخفض' : '🟡 Low'}</span>
              <span>({metrics.lowCount})</span>
            </button>
          </div>

          <button
            onClick={fetchSuggestions}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background hover:bg-surface-hover p-2 text-muted-foreground transition-colors disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw size={16} className={cn(loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* ── Table of Refill Suggestions ─────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left rtl:text-right text-sm whitespace-nowrap">
            <thead className="border-b border-border bg-surface-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3.5 text-center">
                  <button
                    onClick={toggleSelectAll}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {selectedIds.size > 0 && selectedIds.size === filteredItems.length ? (
                      <CheckSquare size={18} className="text-brand-500" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3.5 font-semibold text-left rtl:text-right">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3.5 font-semibold text-left rtl:text-right">{isAr ? 'اسم الدواء' : 'Medicine Name'}</th>
                <th className="px-4 py-3.5 font-semibold text-center">{isAr ? 'مخزون الرف' : 'Shelf Stock'}</th>
                <th className="px-4 py-3.5 font-semibold text-center">{isAr ? 'المستودع' : 'Back Store'}</th>
                <th className="px-4 py-3.5 font-semibold text-center">{isAr ? 'الحد الأدنى للرف' : 'Min Shelf Qty'}</th>
                <th className="px-4 py-3.5 font-semibold text-center">{isAr ? 'المقترح' : 'Suggested'}</th>
                <th className="px-4 py-3.5 font-semibold text-right rtl:text-left">{isAr ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-brand-500" />
                    <p className="mt-2 text-sm">Checking shelf & warehouse balances...</p>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                    <p className="mt-2 font-medium text-foreground">All shelves are adequately stocked!</p>
                    <p className="text-xs text-muted-foreground">No medicines currently need refilling from the warehouse.</p>
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const qty = quantities[item.medicine_id] || item.suggested_refill;
                  const isSelected = selectedIds.has(item.medicine_id);
                  const earliestBatch = item.available_batches[0];
                  const unit = item.unit || 'Units';

                  return (
                    <tr
                      key={item.medicine_id}
                      className={cn(
                        "transition-colors hover:bg-surface-hover/50",
                        isSelected && "bg-brand-500/5"
                      )}
                    >
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => toggleSelect(item.medicine_id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {isSelected ? (
                            <CheckSquare size={18} className="text-brand-500" />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </td>

                      {/* Status Column */}
                      <td className="px-4 py-3.5">
                        {item.status === 'EMPTY_ON_SHELF' ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600 dark:text-red-400 border border-red-500/20">
                            {isAr ? '🔴 فارغ' : '🔴 Empty'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            {isAr ? '🟡 منخفض' : '🟡 Low'}
                          </span>
                        )}
                      </td>

                      {/* Medicine Name Column */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground text-sm">{item.medicine_name}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono text-[11px] bg-background/80 px-1 rounded border border-border">{item.medicine_sku}</span>
                          {earliestBatch && (
                            <span className="text-muted-foreground/80">
                              Batch: <strong className="font-mono">{earliestBatch.batch_number}</strong> (Exp: {new Date(earliestBatch.expiry_date).toLocaleDateString()})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Shelf Stock Column */}
                      <td className="px-4 py-3.5 text-center">
                        <span className={cn(
                          "font-bold text-sm",
                          item.shelf_stock === 0 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"
                        )}>
                          {item.shelf_stock} {unit}
                        </span>
                      </td>

                      {/* Back Store Column */}
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          📦 {Number(item.warehouse_stock || 0).toLocaleString()} {unit}
                        </span>
                      </td>

                      {/* Min Shelf Qty Column */}
                      <td className="px-4 py-3.5 text-center text-sm font-medium text-muted-foreground">
                        {item.reorder_level} {unit}
                      </td>

                      {/* Suggested Refill Stepper Column */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setQuantity(item.medicine_id, Math.max(1, (qty || 1) - 1), item.warehouse_stock)}
                            className="h-7 w-7 rounded-lg border border-border bg-background hover:bg-surface font-bold text-muted-foreground text-sm flex items-center justify-center transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={item.warehouse_stock}
                            value={qty}
                            onChange={e => setQuantity(item.medicine_id, Number(e.target.value), item.warehouse_stock)}
                            className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center font-bold text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                          />
                          <button
                            onClick={() => setQuantity(item.medicine_id, Math.min(item.warehouse_stock, (qty || 0) + 1), item.warehouse_stock)}
                            className="h-7 w-7 rounded-lg border border-border bg-background hover:bg-surface font-bold text-muted-foreground text-sm flex items-center justify-center transition-colors"
                          >
                            +
                          </button>
                          <span className="text-xs text-muted-foreground ml-1 rtl:mr-1">{unit}</span>
                        </div>
                      </td>

                      {/* Action Column */}
                      <td className="px-4 py-3.5 text-right rtl:text-left">
                        <button
                          onClick={() => handleSingleRefill(item)}
                          disabled={refillingId === item.medicine_id || isSubmitting}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold text-white transition-all shadow-sm active:scale-95 disabled:opacity-50",
                            refillingId === item.medicine_id
                              ? "bg-brand-600"
                              : "bg-brand-500 hover:bg-brand-600"
                          )}
                        >
                          <RefreshCw size={13} className={cn(refillingId === item.medicine_id && "animate-spin")} />
                          <span>{refillingId === item.medicine_id ? (isAr ? 'جاري التعبئة...' : 'Refilling...') : (isAr ? 'تعبئة الرف' : 'Refill')}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bottom Action Bar (⚡ Refill All & 🖨️ Print Pick-List) ────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl border border-border bg-surface shadow-sm">
        <button
          onClick={handleBulkRefill}
          disabled={isSubmitting || selectedIds.size === 0}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition-all disabled:opacity-50 shadow-md shadow-brand-500/20 active:scale-95"
        >
          <Sparkles size={16} />
          <span>[⚡ Refill All Suggested Items ({selectedIds.size})]</span>
        </button>

        <button
          onClick={handlePrintPickList}
          disabled={filteredItems.length === 0}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background hover:bg-surface-hover px-5 py-2.5 text-sm font-bold text-foreground transition-all disabled:opacity-50 shadow-sm"
        >
          <Printer size={16} />
          <span>[ 🖨️ Print Restock Pick-List for Storekeeper ]</span>
        </button>
      </div>
    </div>
  );
}
