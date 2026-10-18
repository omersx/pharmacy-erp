'use client';

import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { 
  X, RotateCcw, AlertTriangle, CheckCircle2, ShieldAlert, 
  ArrowRight, RefreshCw, Box, AlertCircle, DollarSign, CreditCard,
  Building2, ShieldCheck, Trash2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ReturnItemState {
  sale_item_id: string;
  medicine_id: string;
  medicine_name: string;
  batch_id: string;
  batch_number: string;
  unit_price: number;
  original_quantity: number;
  already_returned: number;
  returnable_quantity: number;
  selected: boolean;
  return_quantity: number;
  condition: 'GOOD' | 'DAMAGED' | 'EXPIRED' | 'OPENED';
  disposition: 'RESTOCK' | 'QUARANTINE' | 'DISPOSAL';
  reason: string;
}

interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: any;
  currency: string;
  onReturnSuccess: (updatedSale: any) => void;
}

const COMMON_REASONS = [
  'Customer Request',
  'Damaged / Defective',
  'Expired Medicine',
  'Prescription Changed',
  'Wrong Item Dispensed',
];

export function ReturnModal({ isOpen, onClose, sale, currency, onReturnSuccess }: ReturnModalProps) {
  const [items, setItems] = useState<ReturnItemState[]>([]);
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD' | 'STORE_CREDIT'>('CASH');
  const [overallReason, setOverallReason] = useState<string>('Customer Request');
  const [customReason, setCustomReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sale && sale.items) {
      const initialItems: ReturnItemState[] = sale.items.map((item: any) => {
        const origQty = Number(item.quantity) || 0;
        const returnedQty = Number(item.quantity_returned) || 0;
        const returnable = Math.max(0, origQty - returnedQty);

        return {
          sale_item_id: item.id,
          medicine_id: item.medicine_id,
          medicine_name: item.medicine_name || item.medicine?.name_en || `Medicine #${item.medicine_id.slice(0, 8)}`,
          batch_id: item.batch_id,
          batch_number: item.batch_number || item.batch?.batch_number || 'Batch N/A',
          unit_price: Number(item.unit_price) || 0,
          original_quantity: origQty,
          already_returned: returnedQty,
          returnable_quantity: returnable,
          selected: returnable > 0,
          return_quantity: returnable > 0 ? returnable : 0,
          condition: 'GOOD',
          disposition: 'RESTOCK',
          reason: '',
        };
      });
      setItems(initialItems);
      setRefundMethod(sale.payment_method === 'CARD' ? 'CARD' : 'CASH');
      setOverallReason('Customer Request');
      setCustomReason('');
    }
  }, [sale, isOpen]);

  const handleToggleSelect = (index: number) => {
    setItems(prev => {
      const next = [...prev];
      const target = next[index];
      if (target.returnable_quantity <= 0) return prev;
      target.selected = !target.selected;
      if (target.selected && target.return_quantity <= 0) {
        target.return_quantity = target.returnable_quantity;
      }
      return next;
    });
  };

  const handleQuantityChange = (index: number, val: number) => {
    setItems(prev => {
      const next = [...prev];
      const target = next[index];
      const sanitized = Math.max(0, Math.min(target.returnable_quantity, val));
      target.return_quantity = sanitized;
      target.selected = sanitized > 0;
      return next;
    });
  };

  const handleConditionChange = (index: number, condition: 'GOOD' | 'DAMAGED' | 'EXPIRED' | 'OPENED') => {
    setItems(prev => {
      const next = [...prev];
      const target = next[index];
      target.condition = condition;
      // Smart disposition defaults: non-good conditions default to QUARANTINE or DISPOSAL
      if (condition === 'DAMAGED' || condition === 'OPENED') {
        target.disposition = 'QUARANTINE';
      } else if (condition === 'EXPIRED') {
        target.disposition = 'DISPOSAL';
      } else {
        target.disposition = 'RESTOCK';
      }
      return next;
    });
  };

  const handleDispositionChange = (index: number, disposition: 'RESTOCK' | 'QUARANTINE' | 'DISPOSAL') => {
    setItems(prev => {
      const next = [...prev];
      next[index].disposition = disposition;
      return next;
    });
  };

  const selectedItems = items.filter(it => it.selected && it.return_quantity > 0);
  const totalRefund = selectedItems.reduce((sum, it) => sum + (it.return_quantity * it.unit_price), 0);
  const totalRestockedUnits = selectedItems.filter(it => it.disposition === 'RESTOCK').reduce((sum, it) => sum + it.return_quantity, 0);
  const totalQuarantinedUnits = selectedItems.filter(it => it.disposition !== 'RESTOCK').reduce((sum, it) => sum + it.return_quantity, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      toast.error('Please select at least one item to return');
      return;
    }

    setSubmitting(true);
    try {
      const effectiveReason = customReason.trim() ? `${overallReason}: ${customReason.trim()}` : overallReason;
      const payload = {
        refund_method: refundMethod,
        reason: effectiveReason,
        items: selectedItems.map(it => ({
          sale_item_id: it.sale_item_id,
          quantity: it.return_quantity,
          condition: it.condition,
          disposition: it.disposition,
          reason: it.reason || effectiveReason,
        })),
      };

      const result = await api.returnSale(sale.id, payload);
      toast.success(`Successfully processed return of ${currency} ${totalRefund.toFixed(2)}`);
      onReturnSuccess(result);
      onClose();
    } catch (err: any) {
      console.error('Failed to process return', err);
      toast.error(err?.message || 'Failed to process return. Please check items and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!sale) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in-0 duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[90vh] bg-surface border border-border rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="flex-none p-6 border-b border-border bg-background/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <Dialog.Title className="text-xl font-bold text-foreground flex items-center gap-2">
                  Return & Refund Invoice #{sale.invoice_number}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
                  Customer: {sale.customer?.name || 'Walk-in'} • Original Total: {currency} {Number(sale.total_amount).toFixed(2)}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button 
                disabled={submitting}
                className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Form Scroll Area */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Instruction banner */}
            <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/80 space-y-1">
                <p className="font-semibold text-foreground">Controlled Pharmacy Return Inspection</p>
                <p>
                  Returned items in <strong>GOOD</strong> condition can be restocked to inventory. Items marked 
                  <strong> DAMAGED</strong> or <strong>EXPIRED</strong> are automatically diverted to Quarantine / Disposal to prevent spoiled medications from re-entering stock.
                </p>
              </div>
            </div>

            {/* Line Items List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Purchased Items ({items.length})
                </h3>
                <span className="text-xs text-muted-foreground">
                  Select items and set return quantity & condition
                </span>
              </div>

              <div className="space-y-3">
                {items.map((item, idx) => {
                  const isExhausted = item.returnable_quantity <= 0;

                  return (
                    <div 
                      key={item.sale_item_id}
                      className={cn(
                        "rounded-xl border p-4 transition-all",
                        isExhausted 
                          ? "bg-muted/40 border-border/50 opacity-60" 
                          : item.selected 
                            ? "bg-background border-brand-500/50 shadow-sm ring-1 ring-brand-500/20" 
                            : "bg-surface border-border hover:border-border/80"
                      )}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        
                        {/* Checkbox & Medicine Title */}
                        <div className="flex items-start gap-3 min-w-[240px]">
                          <input 
                            type="checkbox"
                            checked={item.selected && !isExhausted}
                            disabled={isExhausted || submitting}
                            onChange={() => handleToggleSelect(idx)}
                            className="mt-1 h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500 rounded-sm cursor-pointer disabled:cursor-not-allowed"
                          />
                          <div>
                            <p className="text-sm font-bold text-foreground leading-tight">
                              {item.medicine_name}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-border">
                                {item.batch_number}
                              </span>
                              <span>•</span>
                              <span>Sold: {item.original_quantity}</span>
                              {item.already_returned > 0 && (
                                <span className="text-amber-500 font-semibold">
                                  ({item.already_returned} returned)
                                </span>
                              )}
                              <span>•</span>
                              <span>{currency} {item.unit_price.toFixed(2)} each</span>
                            </div>
                          </div>
                        </div>

                        {/* Return Controls (when active) */}
                        {!isExhausted ? (
                          <div className="flex flex-wrap items-center gap-3">
                            {/* Quantity Input */}
                            <div className="flex flex-col">
                              <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                                Return Qty (Max {item.returnable_quantity})
                              </label>
                              <input 
                                type="number"
                                min="1"
                                max={item.returnable_quantity}
                                step="any"
                                value={item.return_quantity || ''}
                                disabled={submitting || !item.selected}
                                onChange={(e) => handleQuantityChange(idx, parseFloat(e.target.value) || 0)}
                                className="w-24 px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500 text-center disabled:opacity-50"
                              />
                            </div>

                            {/* Condition Dropdown */}
                            <div className="flex flex-col">
                              <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                                Condition
                              </label>
                              <select 
                                value={item.condition}
                                disabled={submitting || !item.selected}
                                onChange={(e) => handleConditionChange(idx, e.target.value as any)}
                                className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                              >
                                <option value="GOOD">Good / Resellable</option>
                                <option value="DAMAGED">Damaged Package</option>
                                <option value="EXPIRED">Expired / Spoiled</option>
                                <option value="OPENED">Opened / Unsealed</option>
                              </select>
                            </div>

                            {/* Disposition Dropdown */}
                            <div className="flex flex-col">
                              <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                                Stock Action
                              </label>
                              <select 
                                value={item.disposition}
                                disabled={submitting || !item.selected}
                                onChange={(e) => handleDispositionChange(idx, e.target.value as any)}
                                className={cn(
                                  "px-3 py-1.5 text-sm bg-surface border rounded-lg font-medium focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50",
                                  item.disposition === 'RESTOCK' ? "text-emerald-500 border-emerald-500/30" : "text-amber-500 border-amber-500/30"
                                )}
                              >
                                <option value="RESTOCK">Restock (Return to Shelf)</option>
                                <option value="QUARANTINE">Quarantine (Do Not Restock)</option>
                                <option value="DISPOSAL">Disposal / Waste</option>
                              </select>
                            </div>

                            {/* Line Total */}
                            <div className="flex flex-col items-end min-w-[90px]">
                              <label className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
                                Refund
                              </label>
                              <span className="text-sm font-bold text-foreground">
                                {currency} {(item.selected ? item.return_quantity * item.unit_price : 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                            <CheckCircle2 size={14} className="text-muted-foreground" />
                            Fully returned previously
                          </div>
                        )}
                      </div>

                      {/* Warning notice when quarantined */}
                      {item.selected && item.disposition !== 'RESTOCK' && (
                        <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-2 text-xs text-amber-500">
                          <AlertTriangle size={13} className="shrink-0" />
                          <span>
                            This item will be routed to <strong>{item.disposition}</strong>. Sellable batch stock will <strong>NOT</strong> increase.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Refund Options & Payment Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              
              {/* Refund Method */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Refund Payout Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundMethod('CASH')}
                    className={cn(
                      "flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold gap-1.5 transition-all",
                      refundMethod === 'CASH'
                        ? "bg-brand-500/10 border-brand-500 text-brand-500 shadow-sm"
                        : "bg-surface border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <DollarSign size={18} />
                    Cash Drawer
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundMethod('CARD')}
                    className={cn(
                      "flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold gap-1.5 transition-all",
                      refundMethod === 'CARD'
                        ? "bg-brand-500/10 border-brand-500 text-brand-500 shadow-sm"
                        : "bg-surface border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <CreditCard size={18} />
                    Original Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundMethod('STORE_CREDIT')}
                    className={cn(
                      "flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold gap-1.5 transition-all",
                      refundMethod === 'STORE_CREDIT'
                        ? "bg-brand-500/10 border-brand-500 text-brand-500 shadow-sm"
                        : "bg-surface border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Building2 size={18} />
                    Store Credit
                  </button>
                </div>

                {refundMethod === 'CASH' && (
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                    <AlertCircle size={12} className="text-brand-500" />
                    Refund will be automatically subtracted from your active cash session drawer.
                  </p>
                )}
              </div>

              {/* Reason Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Return Reason
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_REASONS.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setOverallReason(r)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded-lg border transition-colors",
                        overallReason === r 
                          ? "bg-brand-500 text-white border-brand-500 font-semibold"
                          : "bg-surface border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input 
                  type="text"
                  placeholder="Additional details / pharmacist notes (optional)..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500 mt-1"
                />
              </div>

            </div>

            {/* Summary & Live Reconciliation Preview */}
            <div className="rounded-xl bg-background border border-border p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase">
                <span>Return Reconciliation Summary</span>
                <span>{selectedItems.length} items selected</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-surface border border-border">
                  <span className="text-xs text-muted-foreground block mb-1">To Sellable Restock</span>
                  <span className="text-lg font-bold text-emerald-500">
                    {totalRestockedUnits} units
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-surface border border-border">
                  <span className="text-xs text-muted-foreground block mb-1">Quarantine / Write-off</span>
                  <span className="text-lg font-bold text-amber-500">
                    {totalQuarantinedUnits} units
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-surface border border-border flex flex-col justify-between">
                  <span className="text-xs text-muted-foreground block mb-1">Total Refund to Pay</span>
                  <span className="text-xl font-black text-brand-500">
                    {currency} {totalRefund.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

          </form>

          {/* Footer Action Buttons */}
          <div className="flex-none p-6 border-t border-border bg-background/50 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || selectedItems.length === 0 || totalRefund <= 0}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-2.5 rounded-xl transition-all shadow-md shadow-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing Return...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Confirm Return ({currency} {totalRefund.toFixed(2)})
                </>
              )}
            </button>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
