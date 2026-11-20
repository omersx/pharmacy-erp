'use client';

import React, { useState } from 'react';
import { X, CreditCard, DollarSign, Calendar, FileText, Loader2, Check } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface RegisterPaymentModalProps {
  open: boolean;
  onClose: () => void;
  invoice: any | null;
  onPaymentSuccess: () => void;
}

export function RegisterPaymentModal({
  open,
  onClose,
  invoice,
  onPaymentSuccess,
}: RegisterPaymentModalProps) {
  const { currency } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('BANKAK');
  const [amount, setAmount] = useState(invoice ? String(invoice.amount_due) : '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (invoice) {
      setAmount(String(invoice.amount_due || 0));
    }
  }, [invoice]);

  if (!open || !invoice) return null;

  const curr = invoice.currency || currency || 'SDG';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }
    if (numAmount > Number(invoice.amount_due) + 0.01) {
      toast.error(`Amount cannot exceed remaining balance of ${formatMoney(invoice.amount_due, curr)}`);
      return;
    }

    setLoading(true);
    try {
      await api.payInvoice(invoice.id, {
        payment_method: paymentMethod,
        amount: numAmount,
        payment_date: paymentDate ? new Date(paymentDate).toISOString() : undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      toast.success('Payment successfully recorded against invoice!');
      onPaymentSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background text-foreground border border-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-border bg-surface">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CreditCard size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold">Register Payment</h2>
              <p className="text-[11px] text-foreground/60 font-mono">{invoice.invoice_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Outstanding Banner */}
          <div className="p-3 bg-surface border border-border rounded-lg flex justify-between items-center">
            <span className="text-foreground/70">Remaining Amount Due:</span>
            <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
              {formatMoney(invoice.amount_due, curr)}
            </span>
          </div>

          {/* Payment Method / Journal */}
          <div>
            <label className="block font-medium text-foreground/80 mb-1.5">Payment Journal / Method</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'BANKAK', label: 'Bankak' },
                { id: 'CASH', label: 'Cash' },
                { id: 'FAWRY', label: 'Fawry' },
                { id: 'CARD', label: 'POS Card' },
                { id: 'BANK_TRANSFER', label: 'Wire Transfer' },
                { id: 'OCASH', label: 'O-Cash' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`py-2 px-2.5 rounded-lg text-center font-medium border transition-colors ${
                    paymentMethod === m.id
                      ? 'border-pos-500 bg-pos-500/10 text-pos-600 dark:text-pos-300 font-bold'
                      : 'border-border bg-surface hover:bg-black/5 dark:hover:bg-white/5 text-foreground/80'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block font-medium text-foreground/80 mb-1">Payment Amount ({curr})</label>
            <div className="relative">
              <input
                type="number"
                step="any"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg py-2 pl-3 pr-16 font-mono text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
              />
              <button
                type="button"
                onClick={() => setAmount(String(invoice.amount_due || 0))}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] font-bold bg-pos-500/10 text-pos-600 dark:text-pos-400 rounded hover:bg-pos-500/20"
              >
                Full Due
              </button>
            </div>
          </div>

          {/* Date and Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-foreground/80 mb-1">Payment Date</label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
              />
            </div>
            <div>
              <label className="block font-medium text-foreground/80 mb-1">Reference / Memo</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. TXN-10294"
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-medium text-foreground/80 mb-1">Notes (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Received via WhatsApp bank slip"
              className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Discard
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              <span>Create Payment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
