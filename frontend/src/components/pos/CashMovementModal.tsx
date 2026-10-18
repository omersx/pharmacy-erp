'use client';

import React, { useState } from 'react';
import { X, Loader2, ArrowDownCircle, ArrowUpCircle, DollarSign, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/app-store';

interface CashMovementModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  onMovementAdded?: () => void;
}

export function CashMovementModal({
  open,
  onClose,
  sessionId,
  onMovementAdded,
}: CashMovementModalProps) {
  const [movementType, setMovementType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const currency = useAppStore((state) => (state as any).currency || 'USD');

  if (!open) return null;

  const quickReasons = movementType === 'CASH_IN'
    ? ['Add Change / Float', 'Register Top-Up', 'Customer Return Fund', 'Other Cash In']
    : ['Petty Cash Expense', 'Store Supplies', 'Courier / Delivery Fee', 'Bank Drop', 'Other Cash Out'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid amount greater than 0');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please specify a reason');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.addCashMovement(sessionId, {
        movement_type: movementType,
        amount: numAmount,
        reason: reason.trim(),
      });
      toast.success(
        movementType === 'CASH_IN'
          ? `Added cash into drawer successfully`
          : `Cash withdrawal recorded successfully`
      );
      setAmount('');
      setReason('');
      onMovementAdded?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to add cash movement', err);
      toast.error(err?.message || 'Failed to record cash movement');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground/50 hover:text-foreground p-1.5 rounded-full hover:bg-background transition-colors"
          disabled={isSubmitting}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-border bg-background/50">
          <h2 className="text-xl font-bold text-foreground">Cash Drawer In / Out</h2>
          <p className="text-xs text-foreground/70 mt-1">
            Record manual cash deposits (change) or petty cash expenses from this register
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Type Selector Buttons */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-background rounded-xl border border-border">
            <button
              type="button"
              onClick={() => {
                setMovementType('CASH_IN');
                setReason('');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
                movementType === 'CASH_IN'
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                  : 'text-foreground/70 hover:text-foreground hover:bg-surface'
              }`}
            >
              <ArrowDownCircle className="w-4 h-4" />
              Cash In (Float)
            </button>
            <button
              type="button"
              onClick={() => {
                setMovementType('CASH_OUT');
                setReason('');
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
                movementType === 'CASH_OUT'
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : 'text-foreground/70 hover:text-foreground hover:bg-surface'
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" />
              Cash Out (Expense)
            </button>
          </div>

          {/* Amount Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground/70 block">
              Amount ({currency})
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <DollarSign className="h-4 w-4 text-foreground/40" />
              </div>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
                placeholder="0.00"
                className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-pos-500"
              />
            </div>
          </div>

          {/* Quick Reason Chips */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground/70 block">
              Quick Suggestions
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickReasons.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setReason(r)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    reason === r
                      ? 'bg-pos-500/20 border-pos-500 text-pos-600 dark:text-pos-300 font-medium'
                      : 'border-border text-foreground/70 hover:bg-background'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Reason / Notes Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground/70 block">
              Reason / Explanation
            </label>
            <div className="relative">
              <div className="absolute top-3 left-3 flex items-center pointer-events-none">
                <FileText className="h-4 w-4 text-foreground/40" />
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                placeholder={movementType === 'CASH_IN' ? 'e.g. Added $50 change' : 'e.g. Bought receipt paper'}
                className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-pos-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 bg-background border border-border hover:bg-surface text-foreground rounded-xl text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-white rounded-xl text-sm font-bold transition-all shadow-md disabled:opacity-60 ${
                movementType === 'CASH_IN'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
              }`}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {movementType === 'CASH_IN' ? 'Deposit Cash' : 'Withdraw Cash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
