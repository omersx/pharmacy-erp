'use client';

import React, { useState } from 'react';
import { X, Loader2, TrendingUp, TrendingDown, Minus, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/app-store';
import { formatMoney } from '@/lib/utils';

interface CloseSessionModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  openingAmount: number;
  onSessionClosed: () => void;
}

export function CloseSessionModal({
  open,
  onClose,
  sessionId,
  openingAmount,
  onSessionClosed,
}: CloseSessionModalProps) {
  const [closingAmount, setClosingAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isClosing, setIsClosing] = useState<boolean>(false);
  
  // Safe extraction to avoid issues if store doesn't have currency
  const currency = useAppStore((state) => (state as any).currency || 'USD');

  if (!open) return null;

  const parsedClosing = parseFloat(closingAmount) || 0;
  const variance = parsedClosing - openingAmount;
  
  let varianceColor = 'text-gray-500';
  let VarianceIcon = Minus;
  let varianceBg = 'bg-gray-500/10 border-gray-500/20';

  if (variance > 0) {
    varianceColor = 'text-green-500';
    VarianceIcon = TrendingUp;
    varianceBg = 'bg-green-500/10 border-green-500/20';
  } else if (variance < 0) {
    varianceColor = 'text-red-500';
    VarianceIcon = TrendingDown;
    varianceBg = 'bg-red-500/10 border-red-500/20';
  }

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingAmount) {
      toast.error('Closing amount is required');
      return;
    }

    setIsClosing(true);
    try {
      await api.closeSession(sessionId, {
        closing_amount: parsedClosing,
        notes: notes.trim() ? notes : undefined,
      });
      toast.success('Session closed successfully');
      onSessionClosed();
    } catch (error) {
      console.error('Failed to close session', error);
      toast.error('Failed to close register');
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-foreground/50 hover:text-foreground p-1 rounded-full hover:bg-background transition-colors"
          disabled={isClosing}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 border-b border-border">
          <h2 className="text-2xl font-bold text-foreground">Close Cash Register</h2>
          <p className="text-sm text-foreground/70 mt-1">End your shift and close out the register</p>
        </div>

        <form onSubmit={handleClose} className="p-6 space-y-4">
          <div className="flex justify-between items-center p-3 bg-background rounded-lg border border-border">
            <span className="text-sm font-medium text-foreground/70">Opening Amount</span>
            <span className="font-semibold text-foreground">{formatMoney(openingAmount, currency)}</span>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground block">Closing Amount</label>
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
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-pos-500"
                placeholder="0.00"
              />
            </div>
          </div>

          {closingAmount !== '' && (
            <div className={`flex items-center gap-2 p-3 rounded-lg border ${varianceBg}`}>
              <VarianceIcon className={`w-5 h-5 ${varianceColor}`} />
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground block">Variance</span>
                <span className={`font-semibold ${varianceColor}`}>
                  {variance > 0 ? '+' : ''}{formatMoney(variance, currency)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground block">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-pos-500 resize-none"
              placeholder="Any comments about variance or issues..."
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isClosing}
              className="flex-1 py-2 px-4 bg-background border border-border hover:bg-surface text-foreground rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isClosing}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-pos-500 hover:bg-pos-500/90 text-white rounded-lg font-medium transition-colors disabled:opacity-70"
            >
              {isClosing ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              Close Register
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
