'use client';

import React, { useState } from 'react';
import { X, Settings, Check, Loader2, Split, Plus, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { usePaymentMethodsStore } from '@/store/payment-methods-store';
import { usePosStore } from '@/store/pos-store';
import { formatMoney } from '@/lib/utils';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSettingsOpen: () => void;
  onSaleComplete?: () => void; // callback to refresh products after sale
  cashSessionId?: string;
  onSaleSuccess?: (saleData: any) => void;
}

interface SplitPaymentEntry {
  id: string;
  methodId: string;
  amount: string;
  reference: string;
}

export default function PaymentModal({
  open,
  onClose,
  onSettingsOpen,
  onSaleComplete,
  cashSessionId,
  onSaleSuccess,
}: PaymentModalProps) {
  const { currency } = useAppStore();
  const { cart, total, subtotal, discount, customer, completeSale } = usePosStore();
  const { methods, recordSale } = usePaymentMethodsStore();

  const [paymentMode, setPaymentMode] = useState<'single' | 'split'>('single');
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const enabledMethods = methods.filter((m) => m.enabled);

  // Split payment state
  const [splitEntries, setSplitEntries] = useState<SplitPaymentEntry[]>([
    { id: 'split-1', methodId: 'cash', amount: '', reference: '' },
    {
      id: 'split-2',
      methodId: enabledMethods.find((m) => m.id !== 'cash')?.id || 'bankak',
      amount: '',
      reference: '',
    },
  ]);

  // Compute allocated and remaining in split mode
  const allocatedTotal = splitEntries.reduce(
    (sum, e) => sum + (parseFloat(e.amount) || 0),
    0
  );
  const remainingDue = Math.max(0, total - allocatedTotal);

  const initSplitIfNeeded = () => {
    if (splitEntries.length === 0) {
      setSplitEntries([
        { id: 'split-1', methodId: 'cash', amount: '', reference: '' },
        {
          id: 'split-2',
          methodId: enabledMethods.find((m) => m.id !== 'cash')?.id || 'bankak',
          amount: '',
          reference: '',
        },
      ]);
    }
  };

  const updateSplitEntry = (
    id: string,
    field: 'methodId' | 'amount' | 'reference',
    val: string
  ) => {
    setSplitEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: val } : e))
    );
  };

  const addSplitRow = () => {
    const usedMethodIds = new Set(splitEntries.map((e) => e.methodId));
    const nextMethod =
      enabledMethods.find((m) => !usedMethodIds.has(m.id)) || enabledMethods[0];
    const rem = Math.max(0, total - allocatedTotal);
    setSplitEntries((prev) => [
      ...prev,
      {
        id: `split-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        methodId: nextMethod?.id || 'cash',
        amount: rem > 0 ? rem.toFixed(2) : '',
        reference: '',
      },
    ]);
  };

  const removeSplitRow = (id: string) => {
    setSplitEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const fillRemaining = (id: string) => {
    const currentEntry = splitEntries.find((e) => e.id === id);
    const entryAmount = parseFloat(currentEntry?.amount || '0') || 0;
    const availableRem = total - (allocatedTotal - entryAmount);
    const targetAmount = Math.max(0, availableRem).toFixed(2);
    updateSplitEntry(id, 'amount', targetAmount);
  };

  // 1. Single Payment completion
  const handleCompleteSingleSale = async () => {
    if (!selectedMethodId || isProcessing) return;

    const method = methods.find((m) => m.id === selectedMethodId);
    if (!method) return;

    setIsProcessing(true);

    try {
      const salePayload: any = {
        payment_method: method.name.toLowerCase(),
        items: cart.map((item) => ({
          medicine_id: item.medicine_id,
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
        })),
        customer_id: customer?.id || null,
      };

      if (cashSessionId && typeof cashSessionId === 'string' && cashSessionId.trim().length > 0) {
        salePayload.cash_session_id = cashSessionId;
      }

      const res: any = await api.processSale(salePayload);

      const receiptData = {
        invoice_number: res?.invoice_number || `INV-${Date.now().toString().slice(-8).toUpperCase()}`,
        created_at: res?.created_at || new Date().toISOString(),
        items: cart.map((item) => ({
          medicine_id: item.medicine_id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
        })),
        total_amount: total,
        payment_method: method.name,
        payments: [
          {
            payment_method: method.name.toUpperCase(),
            method_name: method.name,
            amount: total,
          },
        ],
        customer: customer ? { id: customer.id, name: customer.name } : null,
      };

      recordSale({
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
        })),
        subtotal,
        discount: discount.amount,
        total,
        paymentMethodId: method.id,
        paymentMethodName: method.name,
        paymentType: method.type,
        payments: [
          {
            methodId: method.id,
            methodName: method.name,
            amount: total,
          },
        ],
        customerName: customer?.name || null,
      });

      completeSale();
      toast.success(`Sale completed via ${method.name}!`);

      if (onSaleComplete) {
        onSaleComplete();
      }

      if (onSaleSuccess) {
        onSaleSuccess(receiptData);
      }

      setSelectedMethodId(null);
      onClose();
    } catch (error: any) {
      console.error('Sale failed:', error);
      toast.error(error.message || 'Failed to process sale. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Split Payment completion
  const handleCompleteSplitSale = async () => {
    if (isProcessing) return;

    const validEntries = splitEntries.filter((e) => (parseFloat(e.amount) || 0) > 0);
    if (validEntries.length === 0) {
      toast.error('Please enter payment amounts for each method');
      return;
    }

    const currentAllocated = validEntries.reduce(
      (sum, e) => sum + (parseFloat(e.amount) || 0),
      0
    );

    if (currentAllocated < total - 0.01) {
      toast.error(
        `Insufficient payment. Remaining due: ${formatMoney(total - currentAllocated, currency)}`
      );
      return;
    }

    setIsProcessing(true);

    try {
      const paymentsPayload = validEntries.map((e) => ({
        payment_method: e.methodId.toUpperCase(),
        amount: parseFloat(e.amount),
        reference: e.reference.trim() || undefined,
      }));

      const salePayload: any = {
        payment_method: validEntries.length === 1 ? validEntries[0].methodId.toUpperCase() : 'SPLIT',
        payments: paymentsPayload,
        items: cart.map((item) => ({
          medicine_id: item.medicine_id,
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
        })),
        customer_id: customer?.id || null,
      };

      if (cashSessionId && typeof cashSessionId === 'string' && cashSessionId.trim().length > 0) {
        salePayload.cash_session_id = cashSessionId;
      }

      const res: any = await api.processSale(salePayload);

      const receiptPayments = validEntries.map((e) => {
        const m = methods.find((method) => method.id === e.methodId);
        return {
          payment_method: e.methodId.toUpperCase(),
          method_name: m?.name || e.methodId,
          amount: parseFloat(e.amount),
          reference: e.reference.trim() || undefined,
        };
      });

      const receiptData = {
        invoice_number: res?.invoice_number || `INV-${Date.now().toString().slice(-8).toUpperCase()}`,
        created_at: res?.created_at || new Date().toISOString(),
        items: cart.map((item) => ({
          medicine_id: item.medicine_id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
        })),
        total_amount: total,
        payment_method: validEntries.length === 1 ? receiptPayments[0].method_name : 'Split Payment',
        payments: receiptPayments,
        customer: customer ? { id: customer.id, name: customer.name } : null,
      };

      recordSale({
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
        })),
        subtotal,
        discount: discount.amount,
        total,
        paymentMethodId: 'split',
        paymentMethodName: 'Split Payment',
        paymentType: 'split',
        payments: validEntries.map((e) => ({
          methodId: e.methodId,
          methodName: methods.find((m) => m.id === e.methodId)?.name || e.methodId,
          amount: parseFloat(e.amount),
          reference: e.reference.trim() || undefined,
        })),
        customerName: customer?.name || null,
      });

      completeSale();
      toast.success('Split payment completed successfully!');

      if (onSaleComplete) {
        onSaleComplete();
      }

      if (onSaleSuccess) {
        onSaleSuccess(receiptData);
      }

      onClose();
    } catch (error: any) {
      console.error('Split sale failed:', error);
      toast.error(error.message || 'Failed to process split payment.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setSelectedMethodId(null);
    onClose();
  };

  if (!open) return null;

  const cashMethods = enabledMethods.filter((m) => m.type === 'cash');
  const mobileMethods = enabledMethods.filter((m) => m.type === 'mobile');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl max-w-[580px] w-[95%] shadow-[0_25px_50px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden">
        {/* Header with Mode Toggle */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">Payment</h2>
            <div className="flex items-center bg-surface p-1 rounded-xl border border-border text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPaymentMode('single')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  paymentMode === 'single'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-foreground/50 hover:text-foreground'
                }`}
              >
                Single
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMode('split');
                  initSplitIfNeeded();
                }}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  paymentMode === 'split'
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-foreground/50 hover:text-foreground'
                }`}
              >
                <Split size={14} />
                Split
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                handleClose();
                onSettingsOpen();
              }}
              className="p-2 hover:bg-surface rounded-full text-foreground/40 transition-colors"
              title="Payment Settings"
            >
              <Settings size={18} />
            </button>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-surface rounded-full text-foreground/50 transition-colors"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Total Banner */}
        <div className="px-6 pb-3 pt-1">
          <p className="text-xs text-foreground/40 text-center uppercase tracking-wider mb-0.5">
            Total Due
          </p>
          <div className="text-3xl font-black text-foreground text-center">
            {formatMoney(total, currency)}
          </div>
        </div>

        {/* SINGLE PAYMENT MODE */}
        {paymentMode === 'single' && (
          <div className="px-6 pb-2 max-h-[360px] overflow-y-auto">
            {/* Cash */}
            {cashMethods.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-foreground/40 uppercase tracking-wider mb-2 px-1">
                  Cash
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {cashMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethodId(method.id)}
                      disabled={isProcessing}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
                        selectedMethodId === method.id
                          ? 'border-green-500 bg-green-50 dark:bg-green-500/10 shadow-sm'
                          : 'border-transparent bg-surface hover:border-green-300 dark:hover:border-green-500/40'
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                        style={{ backgroundColor: method.color + '18' }}
                      >
                        {method.logo}
                      </div>
                      <span
                        className={`text-base font-semibold flex-1 text-left ${
                          selectedMethodId === method.id
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-foreground'
                        }`}
                      >
                        {method.name}
                      </span>
                      {selectedMethodId === method.id && (
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile Banks & Digital */}
            {mobileMethods.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-foreground/40 uppercase tracking-wider mb-2 px-1">
                  Mobile Bank / Digital
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {mobileMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethodId(method.id)}
                      disabled={isProcessing}
                      className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 transition-all relative ${
                        selectedMethodId === method.id
                          ? 'border-pos-500 bg-pos-50 dark:bg-pos-500/10 shadow-sm'
                          : 'border-transparent bg-surface hover:border-pos-300 dark:hover:border-pos-500/40'
                      }`}
                    >
                      {selectedMethodId === method.id && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-pos-500 flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl"
                        style={{ backgroundColor: method.color + '18' }}
                      >
                        {method.logo}
                      </div>
                      <span
                        className={`text-xs font-semibold text-center ${
                          selectedMethodId === method.id
                            ? 'text-pos-600 dark:text-pos-300'
                            : 'text-foreground'
                        }`}
                      >
                        {method.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SPLIT PAYMENT MODE */}
        {paymentMode === 'split' && (
          <div className="px-6 pb-2">
            {/* Financial Status Summary */}
            <div className="bg-surface border border-border rounded-xl p-3 mb-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[11px] text-foreground/40 font-semibold uppercase">Total Due</div>
                <div className="text-base font-bold text-foreground mt-0.5">
                  {formatMoney(total, currency)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-foreground/40 font-semibold uppercase">Allocated</div>
                <div className="text-base font-bold text-brand-400 mt-0.5">
                  {formatMoney(allocatedTotal, currency)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-foreground/40 font-semibold uppercase">
                  {allocatedTotal > total ? 'Change Due' : 'Remaining'}
                </div>
                <div
                  className={`text-base font-bold mt-0.5 ${
                    Math.abs(remainingDue) < 0.005
                      ? 'text-green-500 dark:text-green-400'
                      : allocatedTotal > total
                      ? 'text-blue-500'
                      : 'text-amber-500'
                  }`}
                >
                  {allocatedTotal > total
                    ? formatMoney(allocatedTotal - total, currency)
                    : formatMoney(remainingDue, currency)}
                </div>
              </div>
            </div>

            {/* Split Rows */}
            <div className="space-y-2.5 max-h-[240px] overflow-y-auto pr-1">
              {splitEntries.map((entry) => {
                const selectedMethod = enabledMethods.find((m) => m.id === entry.methodId);
                return (
                  <div
                    key={entry.id}
                    className="p-3 bg-surface border border-border rounded-xl space-y-2 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      {/* Method Selector */}
                      <div className="w-[45%]">
                        <select
                          value={entry.methodId}
                          onChange={(e) => updateSplitEntry(entry.id, 'methodId', e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-xs text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                          {enabledMethods.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.logo} {m.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Amount Input */}
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={entry.amount}
                          onChange={(e) => updateSplitEntry(entry.id, 'amount', e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-2.5 py-2 text-sm text-foreground font-bold font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>

                      {/* Fill Remaining button */}
                      <button
                        type="button"
                        onClick={() => fillRemaining(entry.id)}
                        title="Auto-fill remaining balance"
                        className="px-2.5 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 text-xs font-semibold rounded-lg transition-colors shrink-0"
                      >
                        Fill
                      </button>

                      {/* Remove row */}
                      {splitEntries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSplitRow(entry.id)}
                          className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                          title="Remove method"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    {/* Reference / Notes input */}
                    <div>
                      <input
                        type="text"
                        placeholder={
                          selectedMethod?.type === 'cash'
                            ? 'Optional cash notes...'
                            : 'Txn ID / Card Approval # / Reference...'
                        }
                        value={entry.reference}
                        onChange={(e) => updateSplitEntry(entry.id, 'reference', e.target.value)}
                        className="w-full bg-background/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Row Button */}
            <button
              type="button"
              onClick={addSplitRow}
              className="w-full py-2 border border-dashed border-border hover:border-brand-500/50 hover:bg-surface rounded-xl text-xs font-semibold text-brand-400 flex items-center justify-center gap-1.5 transition-colors mt-2"
            >
              <Plus size={14} /> Add Another Payment Method
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="px-6 pb-5 pt-3 flex gap-3 border-t border-border mt-1">
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="flex-1 bg-surface hover:bg-border text-foreground/60 font-semibold py-3.5 rounded-xl transition-colors text-sm disabled:opacity-50"
          >
            Cancel
          </button>

          {paymentMode === 'single' ? (
            <button
              onClick={handleCompleteSingleSale}
              disabled={!selectedMethodId || isProcessing}
              className={`flex-[2] font-bold py-3.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2 ${
                selectedMethodId && !isProcessing
                  ? 'bg-pos-500 hover:bg-pos-600 text-white shadow-lg shadow-pos-500/20'
                  : 'bg-border text-foreground/25 cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing...
                </>
              ) : (
                'Complete Sale'
              )}
            </button>
          ) : (
            <button
              onClick={handleCompleteSplitSale}
              disabled={allocatedTotal < total - 0.01 || isProcessing}
              className={`flex-[2] font-bold py-3.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2 ${
                allocatedTotal >= total - 0.01 && !isProcessing
                  ? 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20'
                  : 'bg-border text-foreground/25 cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing Split...
                </>
              ) : (
                `Complete Split (${splitEntries.filter((e) => (parseFloat(e.amount) || 0) > 0).length} Methods)`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
