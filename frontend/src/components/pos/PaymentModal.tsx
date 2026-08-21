'use client';

import React, { useState } from 'react';
import { X, Settings, Check, Loader2 } from 'lucide-react';
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

export default function PaymentModal({ open, onClose, onSettingsOpen, onSaleComplete, cashSessionId, onSaleSuccess }: PaymentModalProps) {
  const { currency } = useAppStore();
  const { cart, total, subtotal, discount, customer, completeSale } = usePosStore();
  const { methods, recordSale } = usePaymentMethodsStore();

  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const enabledMethods = methods.filter((m) => m.enabled);

  const handleCompleteSale = async () => {
    if (!selectedMethodId || isProcessing) return;

    const method = methods.find((m) => m.id === selectedMethodId);
    if (!method) return;

    setIsProcessing(true);

    try {
      // 1. Call the backend API to create the sale and deduct stock
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

      // Construct receipt data for the receipt modal
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
        customer: customer ? { id: customer.id, name: customer.name } : null,
      };

      // 2. Record in local payment tracking store (for POS-level summary)
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
        customerName: customer?.name || null,
      });

      // 3. Clear the POS cart
      completeSale();

      // 4. Notify success
      toast.success(`Sale completed via ${method.name}!`);

      // 5. Refresh product data (stock quantities changed)
      if (onSaleComplete) {
        onSaleComplete();
      }

      // 6. Trigger receipt if callback provided
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

  const handleClose = () => {
    if (isProcessing) return; // Don't close while processing
    setSelectedMethodId(null);
    onClose();
  };

  if (!open) return null;

  // Separate cash and mobile methods
  const cashMethods = enabledMethods.filter((m) => m.type === 'cash');
  const mobileMethods = enabledMethods.filter((m) => m.type === 'mobile');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-2xl max-w-[560px] w-[95%] shadow-[0_25px_50px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <h2 className="text-2xl font-bold text-foreground">Payment</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { handleClose(); onSettingsOpen(); }}
              className="p-2 hover:bg-surface rounded-full text-foreground/40 transition-colors"
              title="Payment Settings"
            >
              <Settings size={18} />
            </button>
            <button onClick={handleClose} className="p-2 hover:bg-surface rounded-full text-foreground/50 transition-colors">
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Total */}
        <div className="px-6 pb-4 pt-1">
          <p className="text-sm text-foreground/40 text-center mb-0.5">Total Due</p>
          <div className="text-4xl font-black text-foreground text-center">
            {formatMoney(total, currency)}
          </div>
        </div>

        {/* All Payment Options */}
        <div className="px-6 pb-2">
          {/* Cash */}
          {cashMethods.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-foreground/40 uppercase tracking-wider mb-2 px-1">Cash</div>
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
                    <span className={`text-base font-semibold flex-1 text-left ${
                      selectedMethodId === method.id ? 'text-green-700 dark:text-green-300' : 'text-foreground'
                    }`}>
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

          {/* Mobile Banks */}
          {mobileMethods.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-foreground/40 uppercase tracking-wider mb-2 px-1">Mobile Bank</div>
              <div className="grid grid-cols-3 gap-2">
                {mobileMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethodId(method.id)}
                    disabled={isProcessing}
                    className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border-2 transition-all relative ${
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
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl"
                      style={{ backgroundColor: method.color + '18' }}
                    >
                      {method.logo}
                    </div>
                    <span className={`text-sm font-semibold ${
                      selectedMethodId === method.id ? 'text-pos-600 dark:text-pos-300' : 'text-foreground'
                    }`}>
                      {method.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-6 pb-5 pt-2 flex gap-3">
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="flex-1 bg-surface hover:bg-border text-foreground/60 font-semibold py-4 rounded-xl transition-colors text-base disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCompleteSale}
            disabled={!selectedMethodId || isProcessing}
            className={`flex-[2] font-bold py-4 rounded-xl transition-all text-base flex items-center justify-center gap-2 ${
              selectedMethodId && !isProcessing
                ? 'bg-pos-500 hover:bg-pos-600 text-white shadow-lg shadow-pos-500/20'
                : 'bg-border text-foreground/25 cursor-not-allowed'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Processing...
              </>
            ) : (
              'Complete Sale'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
