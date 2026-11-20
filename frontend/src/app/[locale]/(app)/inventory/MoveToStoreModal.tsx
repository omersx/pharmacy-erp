'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api';
import { Archive, ArrowRight, ArrowLeft, X, Sparkles, AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MoveToStoreModalProps {
  open: boolean;
  onClose: () => void;
  medicine: {
    id: string;
    name_en: string;
    name_ar?: string;
    sku?: string;
    dosage_form?: string;
  } | null;
  currentShelfStock: number;
  currentWarehouseStock: number;
  unit: string;
  onSuccess: () => void;
}

export function MoveToStoreModal({
  open,
  onClose,
  medicine,
  currentShelfStock,
  currentWarehouseStock,
  unit,
  onSuccess,
}: MoveToStoreModalProps) {
  const params = useParams();
  const isAr = params?.locale === 'ar';

  const [quantity, setQuantity] = useState<string>('10');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  if (!open || !medicine) return null;

  const numQty = parseFloat(quantity) || 0;
  const isValid = numQty > 0 && numQty <= currentShelfStock;
  const newShelf = Math.max(0, currentShelfStock - numQty);
  const newWarehouse = currentWarehouseStock + numQty;

  const handleQuickQty = (amount: number) => {
    const clamped = Math.min(Math.max(1, amount), currentShelfStock);
    setQuantity(String(clamped));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      toast.error(
        isAr 
          ? `الرجاء تحديد كمية صالحة بين 1 و ${currentShelfStock}` 
          : `Please specify a valid quantity between 1 and ${currentShelfStock}`
      );
      return;
    }

    try {
      setLoading(true);
      await api.moveToWarehouse({
        medicine_id: medicine.id,
        quantity: numQty,
        notes: notes.trim() || undefined,
      });

      toast.success(
        isAr
          ? `تم نقل ${numQty} ${unit} بنجاح من الرف إلى المستودع 📦`
          : `Successfully moved ${numQty} ${unit} from Shelf to Back Store 📦`
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || (isAr ? 'فشل نقل المخزون' : 'Failed to move stock'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl relative overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Archive size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {isAr ? 'نقل المخزون إلى المستودع الخلفي' : 'Move Stock to Back Store'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr 
                  ? 'تحويل الفائض من رف الصرف إلى غرفة التخزين الخلفية' 
                  : 'Transfer surplus stock from dispensary shelf to storage room'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          {/* Medicine Card */}
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-foreground">
                  {isAr && medicine.name_ar ? medicine.name_ar : medicine.name_en}
                </h3>
                {isAr && medicine.name_ar && (
                  <p className="text-xs text-muted-foreground mt-0.5">{medicine.name_en}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {medicine.sku && (
                    <span className="font-mono text-[11px] bg-surface px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                      {medicine.sku}
                    </span>
                  )}
                  {medicine.dosage_form && (
                    <span className="text-xs text-muted-foreground">
                      {medicine.dosage_form}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Current Stock Distribution */}
            <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-border/60">
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-2.5 text-center">
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                  {isAr ? 'الرصيد على الرف الحالي' : 'Current Shelf Stock'}
                </span>
                <span className="text-base font-extrabold text-foreground mt-0.5 block">
                  🟢 {currentShelfStock} {unit}
                </span>
              </div>
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-2.5 text-center">
                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 block">
                  {isAr ? 'رصيد المستودع الحالي' : 'Current Back Store'}
                </span>
                <span className="text-base font-extrabold text-foreground mt-0.5 block">
                  📦 {currentWarehouseStock} {unit}
                </span>
              </div>
            </div>
          </div>

          {/* Transfer Quantity Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {isAr ? 'الكمية المراد نقلها للمستودع' : 'Quantity to Move to Store'}
              </label>
              <span className="text-xs text-muted-foreground font-mono">
                {isAr ? `الحد الأقصى: ${currentShelfStock} ${unit}` : `Max: ${currentShelfStock} ${unit}`}
              </span>
            </div>

            <div className="relative">
              <input
                type="number"
                min="1"
                max={currentShelfStock}
                step="any"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className={cn(
                  "w-full rounded-xl border bg-background px-4 py-2.5 text-base font-semibold text-foreground focus:outline-none transition-all",
                  !isValid && quantity
                    ? "border-rose-500 focus:border-rose-500 ring-1 ring-rose-500/20"
                    : "border-border focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                )}
                placeholder="0"
                autoFocus
              />
              <span className="absolute right-3 rtl:right-auto rtl:left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                {unit}
              </span>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {currentShelfStock >= 5 && (
                <button
                  type="button"
                  onClick={() => handleQuickQty(5)}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-hover transition-colors"
                >
                  5
                </button>
              )}
              {currentShelfStock >= 10 && (
                <button
                  type="button"
                  onClick={() => handleQuickQty(10)}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-hover transition-colors"
                >
                  10
                </button>
              )}
              {currentShelfStock >= 20 && (
                <button
                  type="button"
                  onClick={() => handleQuickQty(Math.floor(currentShelfStock / 2))}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-hover transition-colors"
                >
                  50% ({Math.floor(currentShelfStock / 2)})
                </button>
              )}
              {currentShelfStock > 10 && (
                <button
                  type="button"
                  onClick={() => handleQuickQty(currentShelfStock - 10)}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-hover transition-colors"
                >
                  {isAr ? 'إبقاء 10 على الرف' : 'Keep 10 on Shelf'}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleQuickQty(currentShelfStock)}
                className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-surface-hover transition-colors"
              >
                {isAr ? `الكل (${currentShelfStock})` : `All (${currentShelfStock})`}
              </button>
            </div>
          </div>

          {/* Outcome Live Preview */}
          {isValid && (
            <div className="rounded-xl border border-border bg-surface/50 p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-muted-foreground">
                  {isAr ? 'النتيجة بعد النقل:' : 'After Transfer:'}
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {isAr ? `الرف: ${newShelf} ${unit}` : `Shelf: ${newShelf} ${unit}`}
                </span>
                <span className="text-muted-foreground">➔</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {isAr ? `المستودع: ${newWarehouse} ${unit}` : `Store: ${newWarehouse} ${unit}`}
                </span>
              </div>
            </div>
          )}

          {/* Notes (Optional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground block">
              {isAr ? 'ملاحظات (اختياري)' : 'Notes / Reason (Optional)'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isAr ? 'مثال: تنظيم الفائض في المخزن الخلفي' : 'e.g. Overstock reorganization, back room storage'}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={!isValid || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
            >
              <Archive size={14} />
              {loading 
                ? (isAr ? 'جاري النقل...' : 'Moving...') 
                : (isAr ? `تأكيد نقل ${numQty || 0} للمستودع` : `Confirm Move ${numQty || 0} to Store`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
