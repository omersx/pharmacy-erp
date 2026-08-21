'use client';

import React from 'react';
import { X, Printer } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';

interface SaleReceiptProps {
  open: boolean;
  onClose: () => void;
  saleData: {
    invoice_number: string;
    created_at: string;
    items: { medicine_id: string; quantity: number; unit_price: number; line_total: number; name?: string }[];
    total_amount: number;
    payment_method: string;
    customer?: { id: string; name: string } | null;
  } | null;
}

export function SaleReceipt({ open, onClose, saleData }: SaleReceiptProps) {
  const { currency } = useAppStore();

  if (!open || !saleData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background text-foreground border-border w-full max-w-md rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header (Not printed) */}
        <div className="flex justify-between items-center p-4 border-b border-border bg-surface print:hidden">
          <h2 className="text-lg font-semibold">Sale Receipt</h2>
          <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Receipt content (Scrollable area) */}
        <div className="p-6 overflow-y-auto flex-1 bg-gray-50 dark:bg-gray-900 print:bg-white flex justify-center">
          
          {/* Actual printed area */}
          <div 
            id="receipt-print-area" 
            className="bg-white text-black w-full max-w-[300px] p-4 shadow-sm border border-gray-200 print:shadow-none print:border-none font-mono text-sm"
            style={{ width: '80mm', minHeight: '100px' }}
          >
            {/* Header */}
            <div className="text-center mb-4">
              <h1 className="font-bold text-lg">Pharma ERP</h1>
              <p className="text-xs">Main Branch</p>
            </div>

            {/* Info */}
            <div className="mb-4 text-xs">
              <p>Invoice #: {saleData.invoice_number}</p>
              <p>Date: {new Date(saleData.created_at).toLocaleString()}</p>
              {saleData.customer && <p>Customer: {saleData.customer.name}</p>}
            </div>

            <div className="border-t border-dashed border-gray-400 my-2"></div>

            {/* Items */}
            <table className="w-full text-xs text-left mb-4">
              <thead>
                <tr>
                  <th className="py-1">Item</th>
                  <th className="py-1 text-center">Qty</th>
                  <th className="py-1 text-right">Price</th>
                  <th className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {saleData.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-1 truncate max-w-[100px]">{item.name || 'Item'}</td>
                    <td className="py-1 text-center">{item.quantity}</td>
                    <td className="py-1 text-right">{formatMoney(item.unit_price, currency)}</td>
                    <td className="py-1 text-right">{formatMoney(item.line_total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-dashed border-gray-400 my-2"></div>

            {/* Totals */}
            <div className="text-xs space-y-1 mb-4">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatMoney(saleData.total_amount, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax:</span>
                <span>{formatMoney(0, currency)}</span>
              </div>
              <div className="flex justify-between font-bold text-base mt-2">
                <span>Total:</span>
                <span>{formatMoney(saleData.total_amount, currency)}</span>
              </div>
            </div>

            {/* Payment Info */}
            <div className="text-xs mb-6">
              <p>Payment Method: <span className="capitalize">{saleData.payment_method}</span></p>
            </div>

            {/* Footer */}
            <div className="text-center text-xs mt-4">
              <p>Thank you for your purchase!</p>
            </div>
          </div>
        </div>

        {/* Footer actions (Not printed) */}
        <div className="p-4 border-t border-border flex justify-end gap-3 print:hidden bg-surface">
          <button 
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            Close
          </button>
          <button 
            onClick={() => window.print()}
            className="px-4 py-2 bg-pos-500 text-white rounded-md hover:bg-pos-600 transition-colors flex items-center gap-2"
          >
            <Printer size={18} />
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
