'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Loader2, TrendingUp, TrendingDown, CheckCircle2, 
  DollarSign, Calculator, ArrowDownRight, ArrowUpRight, 
  AlertCircle, Copy, Banknote, ArrowDownCircle, Download, 
  Printer, ChevronDown, ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/app-store';
import { formatMoney } from '@/lib/utils';
import { CashDenominationsModal } from './CashDenominationsModal';

interface CloseSessionModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  openingAmount?: number;
  onSessionClosed: () => void;
  onCashMovementOpen?: () => void;
}

interface PaymentBreakdownItem {
  payment_method: string;
  display_name: string;
  expected_amount: number;
  orders_count: number;
}

interface SessionSummaryData {
  opening_amount: number;
  total_cash_sales: number;
  total_card_sales: number;
  total_other_sales: number;
  gross_sales_amount: number;
  total_sales_count: number;
  orders_count: number;
  total_cash_refunds: number;
  total_cash_in: number;
  total_cash_out: number;
  expected_amount: number;
  payments_breakdown: PaymentBreakdownItem[];
}

export function CloseSessionModal({
  open,
  onClose,
  sessionId,
  openingAmount = 0,
  onSessionClosed,
  onCashMovementOpen,
}: CloseSessionModalProps) {
  const currency = useAppStore((state) => (state as any).currency || 'USD');

  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);
  const [summary, setSummary] = useState<SessionSummaryData | null>(null);
  
  // Per-method counted amounts (e.g. { "CASH": "5000", "BANKAK": "2170225" })
  const [countedAmounts, setCountedAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<string>('');
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [showCashBreakdown, setShowCashBreakdown] = useState<boolean>(true);

  // Cash Denominations Modal
  const [denominationsOpen, setDenominationsOpen] = useState<boolean>(false);
  // Daily Sale Modal
  const [dailySaleOpen, setDailySaleOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!open || !sessionId) return;

    let mounted = true;
    setLoadingSummary(true);
    setNotes('');

    api.getSessionSummary(sessionId)
      .then((data: any) => {
        if (!mounted) return;
        const bdown: PaymentBreakdownItem[] = Array.isArray(data.payments_breakdown)
          ? data.payments_breakdown.map((b: any) => ({
              payment_method: b.payment_method,
              display_name: b.display_name || b.payment_method,
              expected_amount: Number(b.expected_amount) || 0,
              orders_count: Number(b.orders_count) || 0,
            }))
          : [];

        const gross = Number(data.gross_sales_amount) || (
          Number(data.total_cash_sales || 0) +
          Number(data.total_card_sales || 0) +
          Number(data.total_other_sales || 0)
        );

        setSummary({
          opening_amount: Number(data.opening_amount) || openingAmount,
          total_cash_sales: Number(data.total_cash_sales) || 0,
          total_card_sales: Number(data.total_card_sales) || 0,
          total_other_sales: Number(data.total_other_sales) || 0,
          gross_sales_amount: gross,
          total_sales_count: Number(data.total_sales_count) || 0,
          orders_count: Number(data.orders_count) || Number(data.total_sales_count) || 0,
          total_cash_refunds: Number(data.total_cash_refunds) || 0,
          total_cash_in: Number(data.total_cash_in) || 0,
          total_cash_out: Number(data.total_cash_out) || 0,
          expected_amount: Number(data.expected_amount) || openingAmount,
          payments_breakdown: bdown,
        });

        // Initialize all tenders (including Cash) with their expected amounts by default (matches Odoo)
        const initialCounts: Record<string, string> = {
          CASH: String(Number(data.expected_amount) ?? openingAmount),
        };
        bdown.forEach((item) => {
          initialCounts[item.payment_method] = String(item.expected_amount);
        });
        setCountedAmounts(initialCounts);
      })
      .catch((err) => {
        console.error('Failed to load session summary', err);
        if (mounted) {
          setSummary({
            opening_amount: openingAmount,
            total_cash_sales: 0,
            total_card_sales: 0,
            total_other_sales: 0,
            gross_sales_amount: 0,
            total_sales_count: 0,
            orders_count: 0,
            total_cash_refunds: 0,
            total_cash_in: 0,
            total_cash_out: 0,
            expected_amount: openingAmount,
            payments_breakdown: [
              { payment_method: 'CASH', display_name: 'Cash', expected_amount: 0, orders_count: 0 }
            ],
          });
          setCountedAmounts({ CASH: String(openingAmount) });
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

  const expectedCash = summary ? summary.expected_amount : openingAmount;
  const countedCash = parseFloat(countedAmounts['CASH'] || '');
  const hasEnteredCash = !isNaN(countedCash);
  const cashVariance = hasEnteredCash ? countedCash - expectedCash : 0;
  const isCashExact = hasEnteredCash && Math.abs(cashVariance) < 0.001;

  const handleCopyExpected = (method: string, expectedVal: number) => {
    setCountedAmounts((prev) => ({
      ...prev,
      [method]: String(expectedVal),
    }));
    toast.success(`Copied expected amount for ${method}`, { duration: 1500 });
  };

  const handleClearMethod = (method: string) => {
    setCountedAmounts((prev) => ({
      ...prev,
      [method]: '0',
    }));
  };

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasEnteredCash || countedCash < 0) {
      toast.error('Please enter the actual cash counted in the drawer');
      return;
    }

    if (!isCashExact && !notes.trim()) {
      toast.error('Please enter an explanation for the cash difference');
      return;
    }

    setIsClosing(true);
    try {
      // Build closing notes with any electronic discrepancies
      let finalNotes = notes.trim();
      const electronicDiscrepancies: string[] = [];
      if (summary?.payments_breakdown) {
        summary.payments_breakdown.forEach((pm) => {
          if (pm.payment_method !== 'CASH') {
            const counted = parseFloat(countedAmounts[pm.payment_method] || '0') || 0;
            const diff = counted - pm.expected_amount;
            if (Math.abs(diff) > 0.001) {
              electronicDiscrepancies.push(
                `${pm.display_name}: Expected ${pm.expected_amount}, Counted ${counted} (Diff ${diff > 0 ? '+' : ''}${diff})`
              );
            }
          }
        });
      }
      if (electronicDiscrepancies.length > 0) {
        finalNotes = finalNotes
          ? `${finalNotes} | ${electronicDiscrepancies.join('; ')}`
          : electronicDiscrepancies.join('; ');
      }

      await api.closeSession(sessionId, {
        closing_amount: countedCash,
        notes: finalNotes || undefined,
      });

      toast.success('Cash register closed and reconciled successfully');
      onSessionClosed();
    } catch (error: any) {
      console.error('Failed to close session', error);
      toast.error(error?.message || 'Failed to close register');
    } finally {
      setIsClosing(false);
    }
  };

  const handlePrintDailySale = () => {
    setDailySaleOpen(true);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 overflow-y-auto">
        <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative my-4 animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header matching Odoo Closing Register */}
          <div className="p-5 px-6 border-b border-border bg-background/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-foreground">Closing Register</h2>
              <p className="text-xs text-foreground/60">Count each payment tender and reconcile register balances</p>
            </div>
            
            {/* Top-Right Revenue Banner (3 orders: 57,170,225.00 SDG) */}
            {summary && (
              <div className="bg-pos-500/10 border border-pos-500/20 px-3.5 py-1.5 rounded-xl text-right">
                <span className="text-xs font-bold text-foreground block">
                  {summary.orders_count} {summary.orders_count === 1 ? 'order' : 'orders'} :{' '}
                  <span className="text-pos-600 dark:text-pos-300">
                    {formatMoney(summary.gross_sales_amount, currency)}
                  </span>
                </span>
              </div>
            )}
          </div>

          {loadingSummary ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-pos-500" />
              <span className="text-sm text-foreground/70">Calculating live register totals...</span>
            </div>
          ) : (
            <form onSubmit={handleClose} className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              
              {/* Payment Methods Breakdown Table (Matching Odoo Screenshot 3 & 4) */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground/70 block">
                  Payment Method Reconciliation
                </span>

                {/* 1. CASH ROW */}
                <div className="rounded-xl border border-border bg-background p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">Cash</span>
                      <button
                        type="button"
                        onClick={() => setShowCashBreakdown(!showCashBreakdown)}
                        className="text-xs text-foreground/50 hover:text-foreground flex items-center gap-0.5"
                      >
                        {showCashBreakdown ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>Drawer Math</span>
                      </button>
                    </div>
                    <span className="font-extrabold text-sm text-foreground">
                      Expected: {formatMoney(expectedCash, currency)}
                    </span>
                  </div>

                  {/* Collapsible Cash Drawer Details (Opening, Cash In/Out, Sales) */}
                  {showCashBreakdown && (
                    <div className="text-xs bg-surface/70 rounded-lg p-2.5 space-y-1.5 border border-border/60">
                      <div className="flex justify-between text-foreground/70">
                        <span>Opening Float</span>
                        <span>{formatMoney(summary?.opening_amount || 0, currency)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="flex items-center gap-1"><ArrowDownRight size={12} /> Cash Sales</span>
                        <span>+{formatMoney(summary?.total_cash_sales || 0, currency)}</span>
                      </div>
                      {Boolean(summary?.total_cash_in) && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                          <span className="flex items-center gap-1"><ArrowDownRight size={12} /> Cash In (Float Added)</span>
                          <span>+{formatMoney(summary?.total_cash_in || 0, currency)}</span>
                        </div>
                      )}
                      {Boolean(summary?.total_cash_out) && (
                        <div className="flex justify-between text-rose-600 dark:text-rose-400">
                          <span className="flex items-center gap-1"><ArrowUpRight size={12} /> Cash Out (Payouts/Drops)</span>
                          <span>-{formatMoney(summary?.total_cash_out || 0, currency)}</span>
                        </div>
                      )}
                      {Boolean(summary?.total_cash_refunds) && (
                        <div className="flex justify-between text-rose-600 dark:text-rose-400">
                          <span className="flex items-center gap-1"><ArrowUpRight size={12} /> Cash Refunds</span>
                          <span>-{formatMoney(summary?.total_cash_refunds || 0, currency)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cash Count Input Bar matching Odoo: [Value] [x] [💵] [📋] */}
                  <div className="flex items-center gap-2 pt-1">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <DollarSign className="h-4 w-4 text-foreground/40" />
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={countedAmounts['CASH'] ?? ''}
                        onChange={(e) => setCountedAmounts({ ...countedAmounts, CASH: e.target.value })}
                        required
                        placeholder="0.00"
                        className="w-full pl-9 pr-8 py-2 bg-surface border border-border rounded-xl text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-pos-500"
                      />
                      {countedAmounts['CASH'] && (
                        <button
                          type="button"
                          onClick={() => handleClearMethod('CASH')}
                          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-foreground/40 hover:text-foreground"
                          title="Clear"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Denominations Button [💵] */}
                    <button
                      type="button"
                      onClick={() => setDenominationsOpen(true)}
                      className="p-2 px-3 bg-surface border border-border hover:bg-background text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Open Coins & Bills Counter"
                    >
                      <Banknote className="w-4 h-4" />
                      <span className="hidden sm:inline">Count</span>
                    </button>

                    {/* Copy Expected Button [📋] */}
                    <button
                      type="button"
                      onClick={() => handleCopyExpected('CASH', expectedCash)}
                      className="p-2 px-2.5 bg-surface border border-border hover:bg-background text-foreground/70 hover:text-foreground rounded-xl text-xs font-medium transition-colors"
                      title="Copy expected cash amount"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Cash Live Difference */}
                  {hasEnteredCash && (
                    <div className="flex items-center justify-between text-xs pt-1 px-1">
                      <span className="text-foreground/70">Difference:</span>
                      <span
                        className={`font-bold ${
                          isCashExact
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : cashVariance > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {cashVariance > 0 ? '+' : ''}
                        {formatMoney(cashVariance, currency)}
                        {isCashExact ? ' (Balanced)' : cashVariance > 0 ? ' (Surplus)' : ' (Shortage)'}
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. ELECTRONIC TENDERS (Bankak, Fawry, O-Cash, Card, etc.) */}
                {summary?.payments_breakdown
                  ?.filter((item) => item.payment_method !== 'CASH')
                  .map((pm) => {
                    const counted = parseFloat(countedAmounts[pm.payment_method] || '0') || 0;
                    const diff = counted - pm.expected_amount;
                    const isExact = Math.abs(diff) < 0.001;

                    return (
                      <div
                        key={pm.payment_method}
                        className="rounded-xl border border-border bg-background p-3.5 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-sm text-foreground">{pm.display_name}</span>
                            <span className="text-xs text-foreground/50 ml-2">({pm.orders_count} orders)</span>
                          </div>
                          <span className="font-extrabold text-sm text-foreground">
                            Expected: {formatMoney(pm.expected_amount, currency)}
                          </span>
                        </div>

                        {/* Input Row: [Value] [x] [📋] */}
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={countedAmounts[pm.payment_method] ?? ''}
                              onChange={(e) =>
                                setCountedAmounts({
                                  ...countedAmounts,
                                  [pm.payment_method]: e.target.value,
                                })
                              }
                              placeholder="0.00"
                              className="w-full px-3 pr-8 py-2 bg-surface border border-border rounded-xl text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-pos-500"
                            />
                            {countedAmounts[pm.payment_method] && (
                              <button
                                type="button"
                                onClick={() => handleClearMethod(pm.payment_method)}
                                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-foreground/40 hover:text-foreground"
                                title="Clear"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Copy Expected Button [📋] */}
                          <button
                            type="button"
                            onClick={() => handleCopyExpected(pm.payment_method, pm.expected_amount)}
                            className="p-2 px-2.5 bg-surface border border-border hover:bg-background text-foreground/70 hover:text-foreground rounded-xl text-xs font-medium transition-colors"
                            title={`Match ${pm.display_name} statement to expected`}
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Difference display */}
                        <div className="flex items-center justify-between text-xs px-1">
                          <span className="text-foreground/70">Difference:</span>
                          <span
                            className={`font-bold ${
                              isExact
                                ? 'text-foreground/60'
                                : diff > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {diff > 0 ? '+' : ''}
                            {formatMoney(diff, currency)}
                            {isExact ? ' (Balanced)' : diff > 0 ? ' (Over)' : ' (Under)'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Closing Notes */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground block">
                    Closing Note {!isCashExact && <span className="text-rose-500">* (Variance reason required)</span>}
                  </label>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required={!isCashExact}
                  rows={2}
                  className={`w-full px-3.5 py-2 bg-background border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-pos-500 resize-none ${
                    !isCashExact && !notes.trim() ? 'border-rose-400 focus:ring-rose-500' : 'border-border'
                  }`}
                  placeholder="Add a closing note or explain any cash/electronic variances..."
                />
              </div>

              {/* Action Bar matching Odoo Screenshots 3 & 4 */}
              <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Left: Close Register & Discard */}
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    type="submit"
                    disabled={isClosing || !hasEnteredCash || (!isCashExact && !notes.trim())}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-5 bg-[#714B67] hover:bg-[#5E3E56] text-white rounded-xl text-sm font-bold transition-all shadow-md shadow-[#714B67]/20 disabled:opacity-60"
                  >
                    {isClosing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Close Register
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isClosing}
                    className="py-2.5 px-4 bg-surface border border-border hover:bg-background text-foreground rounded-xl text-sm font-semibold transition-colors"
                  >
                    Discard
                  </button>
                </div>

                {/* Right: Cash In/Out & Daily Sale Download/Print */}
                <div className="flex gap-2 w-full sm:w-auto justify-end">
                  {onCashMovementOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onCashMovementOpen();
                      }}
                      className="flex-1 sm:flex-none py-2 px-3 bg-surface border border-border hover:bg-background text-foreground text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ArrowDownCircle size={14} className="text-emerald-500" />
                      <span>Cash In/Out</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePrintDailySale}
                    className="flex-1 sm:flex-none py-2 px-3 bg-surface border border-border hover:bg-background text-foreground text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                    title="Export / Print Daily Sales Summary"
                  >
                    <Download size={14} className="text-brand-500" />
                    <span>Daily Sale</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Embedded Denomination Calculator */}
      <CashDenominationsModal
        open={denominationsOpen}
        onClose={() => setDenominationsOpen(false)}
        initialTotal={parseFloat(countedAmounts['CASH'] || '0') || 0}
        onConfirm={(calcTotal, breakdownNote) => {
          setCountedAmounts({
            ...countedAmounts,
            CASH: String(calcTotal),
          });
          if (breakdownNote) {
            setNotes((prev) => (prev ? `${prev} | ${breakdownNote}` : breakdownNote));
          }
        }}
      />

      {/* Daily Sale Z-Report Slip Modal */}
      {dailySaleOpen && summary && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border bg-surface flex items-center justify-between">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <Printer size={16} className="text-pos-500" />
                <span>Daily Sales Summary (Z-Report)</span>
              </h3>
              <button
                type="button"
                onClick={() => setDailySaleOpen(false)}
                className="p-1 rounded-lg text-foreground/50 hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-white text-black font-mono text-xs space-y-4">
              <div className="text-center space-y-1">
                <h2 className="font-bold text-base tracking-wide">PHARMACY POS</h2>
                <p className="text-[11px] text-gray-600">Register Closing & Financial Audit</p>
                <p className="text-[10px] text-gray-500">{new Date().toLocaleString()}</p>
              </div>

              <div className="border-t border-dashed border-gray-400 pt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Session Code:</span>
                  <span className="font-bold">{sessionId ? `REG/${sessionId.slice(0, 6).toUpperCase()}` : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Orders Processed:</span>
                  <span className="font-bold">{summary.orders_count}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-b border-gray-300 py-1 my-1">
                  <span>Gross Sales:</span>
                  <span>{formatMoney(summary.gross_sales_amount, currency)}</span>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <span className="font-bold block border-b border-gray-300 pb-0.5">TENDER BREAKDOWN</span>
                {summary.payments_breakdown?.map((pm) => {
                  const counted = parseFloat(countedAmounts[pm.payment_method] || '0') || pm.expected_amount;
                  const diff = counted - pm.expected_amount;
                  return (
                    <div key={pm.payment_method} className="py-1 border-b border-dashed border-gray-200">
                      <div className="flex justify-between font-semibold">
                        <span>{pm.display_name} ({pm.orders_count}):</span>
                        <span>{formatMoney(pm.expected_amount, currency)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-gray-600 pl-2">
                        <span>Counted: {formatMoney(counted, currency)}</span>
                        <span>Diff: {diff > 0 ? '+' : ''}{formatMoney(diff, currency)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1 pt-1 border-t border-dashed border-gray-400">
                <span className="font-bold block border-b border-gray-300 pb-0.5">DRAWER CASH AUDIT</span>
                <div className="flex justify-between">
                  <span>Opening Float:</span>
                  <span>{formatMoney(summary.opening_amount, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>+ Cash Sales:</span>
                  <span>+{formatMoney(summary.total_cash_sales, currency)}</span>
                </div>
                {Boolean(summary.total_cash_in) && (
                  <div className="flex justify-between">
                    <span>+ Cash In (Float):</span>
                    <span>+{formatMoney(summary.total_cash_in, currency)}</span>
                  </div>
                )}
                {Boolean(summary.total_cash_out) && (
                  <div className="flex justify-between">
                    <span>- Cash Out (Payouts):</span>
                    <span>-{formatMoney(summary.total_cash_out, currency)}</span>
                  </div>
                )}
                {Boolean(summary.total_cash_refunds) && (
                  <div className="flex justify-between">
                    <span>- Cash Refunds:</span>
                    <span>-{formatMoney(summary.total_cash_refunds, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t border-gray-300 pt-1">
                  <span>Expected Drawer Cash:</span>
                  <span>{formatMoney(expectedCash, currency)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Actual Counted Cash:</span>
                  <span>{formatMoney(hasEnteredCash ? countedCash : expectedCash, currency)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Cash Difference:</span>
                  <span className={cashVariance === 0 ? '' : cashVariance > 0 ? 'text-green-700' : 'text-red-700'}>
                    {cashVariance > 0 ? '+' : ''}{formatMoney(cashVariance, currency)}
                    {cashVariance === 0 ? ' (Balanced)' : cashVariance > 0 ? ' (Surplus)' : ' (Shortage)'}
                  </span>
                </div>
              </div>

              {notes && (
                <div className="pt-1 text-[11px] border-t border-dashed border-gray-300">
                  <span className="font-bold">Notes: </span>
                  <span>{notes}</span>
                </div>
              )}

              <div className="pt-4 border-t border-dashed border-gray-400 grid grid-cols-2 gap-4 text-center text-[10px]">
                <div>
                  <div className="border-b border-gray-400 mb-1 h-6"></div>
                  <span>Cashier Signature</span>
                </div>
                <div>
                  <div className="border-b border-gray-400 mb-1 h-6"></div>
                  <span>Manager Signature</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-surface border-t border-border flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDailySaleOpen(false)}
                className="px-3 py-1.5 bg-background border border-border text-foreground text-xs font-semibold rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-1.5 bg-[#714B67] hover:bg-[#5E3E56] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm"
              >
                <Printer size={13} />
                <span>Print Report</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
