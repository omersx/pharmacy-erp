'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Loader2, TrendingUp, TrendingDown, CheckCircle2, 
  DollarSign, Calculator, ArrowDownRight, ArrowUpRight, 
  CreditCard, AlertCircle, ShoppingBag 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/app-store';
import { formatMoney } from '@/lib/utils';

interface CloseSessionModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  openingAmount?: number;
  onSessionClosed: () => void;
}

interface SessionSummaryData {
  opening_amount: number;
  total_cash_sales: number;
  total_card_sales: number;
  total_other_sales: number;
  total_sales_count: number;
  total_cash_refunds: number;
  total_cash_in: number;
  total_cash_out: number;
  expected_amount: number;
}

export function CloseSessionModal({
  open,
  onClose,
  sessionId,
  openingAmount = 0,
  onSessionClosed,
}: CloseSessionModalProps) {
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);
  const [summary, setSummary] = useState<SessionSummaryData | null>(null);
  const [closingAmount, setClosingAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isClosing, setIsClosing] = useState<boolean>(false);

  const currency = useAppStore((state) => (state as any).currency || 'USD');

  useEffect(() => {
    if (!open || !sessionId) return;

    let mounted = true;
    setLoadingSummary(true);
    setClosingAmount('');
    setNotes('');

    api.getSessionSummary(sessionId)
      .then((data: any) => {
        if (!mounted) return;
        setSummary({
          opening_amount: Number(data.opening_amount) || openingAmount,
          total_cash_sales: Number(data.total_cash_sales) || 0,
          total_card_sales: Number(data.total_card_sales) || 0,
          total_other_sales: Number(data.total_other_sales) || 0,
          total_sales_count: Number(data.total_sales_count) || 0,
          total_cash_refunds: Number(data.total_cash_refunds) || 0,
          total_cash_in: Number(data.total_cash_in) || 0,
          total_cash_out: Number(data.total_cash_out) || 0,
          expected_amount: Number(data.expected_amount) || openingAmount,
        });
      })
      .catch((err) => {
        console.error('Failed to load session summary', err);
        // Fallback to opening amount
        if (mounted) {
          setSummary({
            opening_amount: openingAmount,
            total_cash_sales: 0,
            total_card_sales: 0,
            total_other_sales: 0,
            total_sales_count: 0,
            total_cash_refunds: 0,
            total_cash_in: 0,
            total_cash_out: 0,
            expected_amount: openingAmount,
          });
        }
      })
      .finally(() => {
        if (mounted) setLoadingSummary(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, sessionId, openingAmount]);

  if (!open) return null;

  const expectedAmount = summary ? summary.expected_amount : openingAmount;
  const parsedClosing = parseFloat(closingAmount);
  const hasEnteredClosing = !isNaN(parsedClosing);
  const variance = hasEnteredClosing ? parsedClosing - expectedAmount : 0;
  const isExactMatch = hasEnteredClosing && Math.abs(variance) < 0.001;
  const isSurplus = hasEnteredClosing && variance > 0.001;
  const isShortage = hasEnteredClosing && variance < -0.001;

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasEnteredClosing || parsedClosing < 0) {
      toast.error('Please enter the actual cash counted in the drawer');
      return;
    }

    if (!isExactMatch && !notes.trim()) {
      toast.error('Please enter an explanation for the cash variance');
      return;
    }

    setIsClosing(true);
    try {
      await api.closeSession(sessionId, {
        closing_amount: parsedClosing,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      toast.success('Cash session closed and reconciled successfully');
      onSessionClosed();
    } catch (error: any) {
      console.error('Failed to close session', error);
      toast.error(error?.message || 'Failed to close register');
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative my-6 animate-in fade-in zoom-in-95 duration-150">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground/50 hover:text-foreground p-1.5 rounded-full hover:bg-background transition-colors"
          disabled={isClosing}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-border bg-background/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Close Cash Register</h2>
              <p className="text-xs text-foreground/70">Reconcile cash drawer, check variance, and finalize shift</p>
            </div>
          </div>
        </div>

        {loadingSummary ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-pos-500" />
            <span className="text-sm text-foreground/70">Calculating live drawer balance...</span>
          </div>
        ) : (
          <form onSubmit={handleClose} className="p-6 space-y-4">
            {/* Live Drawer Breakdown Card */}
            <div className="bg-background rounded-xl border border-border p-4 space-y-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground/60 block">
                Drawer Breakdown
              </span>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between items-center text-foreground/80">
                  <span>Opening Cash Float</span>
                  <span className="font-semibold">{formatMoney(summary?.opening_amount || 0, currency)}</span>
                </div>

                <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <ArrowDownRight className="w-3.5 h-3.5" /> Cash Sales
                  </span>
                  <span className="font-semibold">+{formatMoney(summary?.total_cash_sales || 0, currency)}</span>
                </div>

                {Boolean(summary?.total_cash_refunds) && (
                  <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                    <span className="flex items-center gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5" /> Cash Refunds / Returns
                    </span>
                    <span className="font-semibold">-{formatMoney(summary?.total_cash_refunds || 0, currency)}</span>
                  </div>
                )}

                {Boolean(summary?.total_cash_in) && (
                  <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <ArrowDownRight className="w-3.5 h-3.5" /> Cash In (Float Added)
                    </span>
                    <span className="font-semibold">+{formatMoney(summary?.total_cash_in || 0, currency)}</span>
                  </div>
                )}

                {Boolean(summary?.total_cash_out) && (
                  <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                    <span className="flex items-center gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5" /> Cash Out (Expenses / Drops)
                    </span>
                    <span className="font-semibold">-{formatMoney(summary?.total_cash_out || 0, currency)}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-border/80 flex justify-between items-center">
                <span className="text-sm font-bold text-foreground">Expected Cash in Drawer</span>
                <span className="text-base font-extrabold text-pos-600 dark:text-pos-300">
                  {formatMoney(expectedAmount, currency)}
                </span>
              </div>
            </div>

            {/* Informational Cards (Card / Digital Sales + Total Transactions) */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-surface border border-border flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="overflow-hidden">
                  <span className="text-foreground/60 block truncate">Card / Digital</span>
                  <span className="font-semibold text-foreground truncate block">
                    {formatMoney(summary?.total_card_sales || 0, currency)}
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface border border-border flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-purple-500 shrink-0" />
                <div className="overflow-hidden">
                  <span className="text-foreground/60 block truncate">Total Sales</span>
                  <span className="font-semibold text-foreground truncate block">
                    {summary?.total_sales_count || 0} receipts
                  </span>
                </div>
              </div>
            </div>

            {/* Actual Counted Closing Cash Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-foreground block">
                Counted Cash in Drawer
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="h-5 w-5 text-foreground/40" />
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={closingAmount}
                  onChange={(e) => setClosingAmount(e.target.value)}
                  required
                  autoFocus
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-pos-500"
                />
              </div>
            </div>

            {/* Live Variance Feedback */}
            {hasEnteredClosing && (
              <div
                className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
                  isExactMatch
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : isSurplus
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                }`}
              >
                {isExactMatch ? (
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                ) : isSurplus ? (
                  <TrendingUp className="w-5 h-5 shrink-0" />
                ) : (
                  <TrendingDown className="w-5 h-5 shrink-0" />
                )}

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {isExactMatch ? 'Balanced Drawer' : isSurplus ? 'Cash Surplus (Over)' : 'Cash Shortage (Under)'}
                    </span>
                    <span className="text-sm font-extrabold">
                      {variance > 0 ? '+' : ''}{formatMoney(variance, currency)}
                    </span>
                  </div>
                  <p className="text-xs opacity-80 mt-0.5">
                    {isExactMatch
                      ? 'Counted cash exactly matches the expected balance'
                      : isSurplus
                      ? 'Drawer has more cash than recorded sales'
                      : 'Drawer has less cash than recorded sales'}
                  </p>
                </div>
              </div>
            )}

            {/* Notes / Explanation Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground block">
                  Closing Notes {hasEnteredClosing && !isExactMatch ? <span className="text-rose-500">* (Required)</span> : <span className="text-foreground/50">(Optional)</span>}
                </label>
                {hasEnteredClosing && !isExactMatch && (
                  <span className="text-xs text-rose-500 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Explain variance
                  </span>
                )}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required={hasEnteredClosing && !isExactMatch}
                rows={2}
                className={`w-full px-3 py-2 bg-background border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-pos-500 resize-none ${
                  hasEnteredClosing && !isExactMatch && !notes.trim()
                    ? 'border-rose-400/80 focus:ring-rose-500'
                    : 'border-border'
                }`}
                placeholder={
                  hasEnteredClosing && !isExactMatch
                    ? 'Reason for variance (e.g. change error, unrecorded receipt, etc.)...'
                    : 'Optional shift handover notes...'
                }
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isClosing}
                className="flex-1 py-2.5 px-4 bg-background border border-border hover:bg-surface text-foreground rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isClosing || !hasEnteredClosing || (!isExactMatch && !notes.trim())}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-orange-600/20 disabled:opacity-60"
              >
                {isClosing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Finalize & Close
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
