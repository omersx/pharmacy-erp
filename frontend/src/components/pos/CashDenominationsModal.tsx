'use client';

import React, { useState } from 'react';
import { X, Calculator, RotateCcw, Check, Banknote } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';

interface CashDenominationsModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (total: number, breakdownNote: string) => void;
  initialTotal?: number;
}

const DEFAULT_DENOMINATIONS = [
  { value: 1000, label: '1,000' },
  { value: 500, label: '500' },
  { value: 200, label: '200' },
  { value: 100, label: '100' },
  { value: 50, label: '50' },
  { value: 20, label: '20' },
  { value: 10, label: '10' },
  { value: 5, label: '5' },
  { value: 1, label: '1' },
];

export function CashDenominationsModal({
  open,
  onClose,
  onConfirm,
}: CashDenominationsModalProps) {
  const currency = useAppStore((state) => (state as any).currency || 'USD');
  const [counts, setCounts] = useState<Record<number, number>>({});

  if (!open) return null;

  const handleCountChange = (val: number, countStr: string) => {
    const num = parseInt(countStr, 10);
    setCounts((prev) => ({
      ...prev,
      [val]: isNaN(num) || num < 0 ? 0 : num,
    }));
  };

  const handleIncrement = (val: number, delta: number) => {
    setCounts((prev) => {
      const cur = prev[val] || 0;
      const next = Math.max(0, cur + delta);
      return { ...prev, [val]: next };
    });
  };

  const total = DEFAULT_DENOMINATIONS.reduce((sum, d) => {
    return sum + d.value * (counts[d.value] || 0);
  }, 0);

  const handleReset = () => {
    setCounts({});
  };

  const handleApply = () => {
    const breakdownParts = DEFAULT_DENOMINATIONS.filter((d) => (counts[d.value] || 0) > 0).map(
      (d) => `${d.label} × ${counts[d.value]}`
    );
    const note = breakdownParts.length > 0 ? `Cash breakdown: ${breakdownParts.join(', ')}` : '';
    onConfirm(total, note);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative my-auto">
        {/* Header */}
        <div className="p-4 px-5 border-b border-border bg-background/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-pos-500/10 text-pos-600 dark:text-pos-400 flex items-center justify-center">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Coins & Bills Calculator</h3>
              <p className="text-xs text-foreground/60">Count physical currency in the drawer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground/50 hover:text-foreground hover:bg-background transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Denomination Rows */}
        <div className="p-4 max-h-[50vh] overflow-y-auto space-y-2">
          {DEFAULT_DENOMINATIONS.map((d) => {
            const count = counts[d.value] || 0;
            const subtotal = d.value * count;

            return (
              <div
                key={d.value}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                  count > 0 ? 'bg-pos-500/5 border-pos-500/30' : 'bg-background border-border/80'
                }`}
              >
                {/* Denomination badge */}
                <div className="w-24 flex items-center gap-2">
                  <span className="font-extrabold text-sm text-foreground">{d.label}</span>
                  <span className="text-[10px] text-foreground/50">{currency}</span>
                </div>

                {/* Counter controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleIncrement(d.value, -1)}
                    disabled={count === 0}
                    className="w-7 h-7 rounded-lg border border-border bg-surface text-foreground hover:bg-background flex items-center justify-center font-bold text-xs disabled:opacity-30 transition-colors"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={count === 0 ? '' : count}
                    onChange={(e) => handleCountChange(d.value, e.target.value)}
                    placeholder="0"
                    className="w-16 h-7 text-center bg-surface border border-border rounded-lg text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleIncrement(d.value, 1)}
                    className="w-7 h-7 rounded-lg border border-border bg-surface text-foreground hover:bg-background flex items-center justify-center font-bold text-xs transition-colors"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIncrement(d.value, 5)}
                    className="px-2 h-7 rounded-lg border border-border bg-surface text-foreground hover:bg-background flex items-center justify-center font-bold text-[10px] transition-colors"
                  >
                    +5
                  </button>
                </div>

                {/* Subtotal */}
                <div className="w-24 text-right">
                  <span className={`text-xs font-bold ${count > 0 ? 'text-pos-600 dark:text-pos-400' : 'text-foreground/40'}`}>
                    {formatMoney(subtotal, currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Summary & Actions */}
        <div className="p-4 px-5 border-t border-border bg-background/50 flex flex-col gap-3">
          <div className="flex justify-between items-center bg-surface border border-border rounded-xl p-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground/70">
              Total Calculated Cash
            </span>
            <span className="text-xl font-extrabold text-pos-600 dark:text-pos-400">
              {formatMoney(total, currency)}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 bg-surface border border-border hover:bg-background text-foreground/70 hover:text-foreground rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-surface border border-border hover:bg-background text-foreground rounded-xl text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 py-2 bg-pos-500 hover:bg-pos-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-pos-500/20"
            >
              <Check className="w-4 h-4" />
              Apply Count
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
