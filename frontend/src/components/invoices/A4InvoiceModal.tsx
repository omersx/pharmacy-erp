'use client';

import React, { useRef, useState, useEffect } from 'react';
import { X, Printer, Download, Building2, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { api } from '@/lib/api';

interface A4InvoiceModalProps {
  open: boolean;
  onClose: () => void;
  invoiceData: any | null; // Can be a CustomerInvoice or a POS Sale with items
}

export function A4InvoiceModal({ open, onClose, invoiceData }: A4InvoiceModalProps) {
  const { currency } = useAppStore();
  const [profile, setProfile] = useState<any>({
    name_en: 'Grand Nile Pharmacy',
    name_ar: 'صيدلية النيل الكبرى',
    tax_number: '300123456700003',
    cr_number: '1010482910',
    phone: '+249 91 234 5678',
    email: 'info@grandnile-pharma.com',
    address: 'Al-Siteen Street, Khartoum',
    city: 'Khartoum',
    currency: 'SDG',
    bank_name: 'Bank of Khartoum (Bankak)',
    bank_account_number: '1234567',
    invoice_terms: 'Medicines cannot be returned without original invoice within 3 days. / البضاعة المباعة لا ترد ولا تستبدل بعد 3 أيام إلا بالفاتورة الأصلية',
    invoice_prefix: 'INV',
  });

  useEffect(() => {
    if (open) {
      api.getPharmacyProfile()
        .then((data: any) => {
          if (data && data.name_en) setProfile(data);
        })
        .catch(() => {});
    }
  }, [open]);

  if (!open || !invoiceData) return null;

  // Normalize data across CustomerInvoice or POS Sale
  const invoiceNumber = invoiceData.invoice_number || (invoiceData.status === 'DRAFT' ? 'DRAFT / مسودة' : 'INV-COUNTER');
  const invoiceDate = invoiceData.invoice_date || invoiceData.created_at || new Date().toISOString();
  const dueDate = invoiceData.due_date || invoiceDate;
  const status = (invoiceData.status || 'PAID').toUpperCase();

  const customerName = invoiceData.customer_name || invoiceData.customer?.name || 'Walk-in Customer (عميل نقدي)';
  const customerPhone = invoiceData.customer_phone || invoiceData.customer?.phone || null;
  const customerTaxId = invoiceData.customer_tax_id || null;
  const customerAddress = invoiceData.customer_address || invoiceData.customer?.address || null;

  const items = (invoiceData.items || []).map((itm: any) => ({
    label: itm.label || itm.medicine_name || itm.name || (itm.medicine?.name_en ?? 'Medicine Item'),
    batchNumber: itm.batch_number || itm.batch?.batch_number || itm.batch || '-',
    quantity: Number(itm.quantity || 1),
    unitPrice: Number(itm.unit_price || 0),
    discountPercent: Number(itm.discount_percent || 0),
    taxPercent: Number(itm.tax_percent || 0),
    lineTotal: Number(itm.line_total || (Number(itm.quantity || 1) * Number(itm.unit_price || 0))),
  }));

  const subtotal = Number(invoiceData.subtotal ?? invoiceData.total_amount ?? 0);
  const discountAmount = Number(invoiceData.discount_amount ?? 0);
  const taxAmount = Number(invoiceData.tax_amount ?? 0);
  const totalAmount = Number(invoiceData.total_amount ?? 0);
  const amountPaid = Number(invoiceData.amount_paid ?? (status === 'PAID' ? totalAmount : 0));
  const amountDue = Number(invoiceData.amount_due ?? (status === 'PAID' ? 0 : totalAmount - amountPaid));

  const payments = invoiceData.payments || [];
  const curr = invoiceData.currency || profile.currency || currency || 'SDG';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto">
      {/* Container styling for screen view */}
      <div className="bg-background text-foreground border border-border w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] my-auto">
        
        {/* Header Action Bar (Hidden when printing) */}
        <div className="flex justify-between items-center px-6 py-3.5 border-b border-border bg-surface print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-pos-500/10 text-pos-600 dark:text-pos-400">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>Official Tax Invoice</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface border border-border text-foreground/80">
                  {invoiceNumber}
                </span>
              </h2>
              <p className="text-xs text-foreground/60">A4 Standard Format & Tax Compliance</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-pos-500 hover:bg-pos-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Printer size={15} />
              <span>Print A4</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-surface border border-border hover:bg-black/5 dark:hover:bg-white/5 text-foreground rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Save as PDF via browser print dialog"
            >
              <Download size={15} />
              <span>Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors ml-2"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Document Canvas */}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 bg-gray-100 dark:bg-gray-950 flex justify-center print:p-0 print:bg-white">
          
          {/* Printable A4 Sheet */}
          <div
            id="a4-invoice-sheet"
            className="bg-white text-gray-900 w-full max-w-[210mm] min-h-[297mm] p-8 sm:p-12 shadow-xl border border-gray-200 print:shadow-none print:border-none print:m-0 print:p-6 font-sans relative flex flex-col justify-between"
            style={{ boxSizing: 'border-box' }}
          >
            {/* DRAFT Watermark if status is DRAFT */}
            {status === 'DRAFT' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 opacity-10">
                <span className="text-9xl font-black text-gray-700 uppercase -rotate-45 select-none tracking-widest">
                  DRAFT
                </span>
              </div>
            )}

            <div className="relative z-10">
              {/* ===== 1. TOP HEADER & PHARMACY BRANDING ===== */}
              <div className="flex justify-between items-start border-b-2 border-gray-900 pb-6 mb-6 gap-6">
                <div className="flex-1">
                  {profile.logo_url ? (
                    <img src={profile.logo_url} alt="Pharmacy Logo" className="h-16 w-auto object-contain mb-2" />
                  ) : (
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-lg">
                        +
                      </div>
                      <h1 className="text-xl font-black text-gray-900 tracking-tight">
                        {profile.name_en}
                      </h1>
                    </div>
                  )}
                  {profile.name_ar && (
                    <p className="text-base font-bold text-gray-700 font-arabic mb-1">{profile.name_ar}</p>
                  )}
                  <p className="text-xs text-gray-600">{profile.address}, {profile.city}</p>
                  <p className="text-xs text-gray-600">Phone: {profile.phone} {profile.email ? `• ${profile.email}` : ''}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 text-[11px] text-gray-700 font-mono">
                    {profile.tax_number && <span>VAT No: <strong className="font-bold">{profile.tax_number}</strong></span>}
                    {profile.cr_number && <span>CR No: <strong className="font-bold">{profile.cr_number}</strong></span>}
                  </div>
                </div>

                {/* Right: Invoice Type & Number Box */}
                <div className="text-right flex flex-col items-end">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 mb-2">
                    {invoiceData.invoice_type === 'OUT_REFUND' ? 'Credit Note (إشعار دائن)' : 'Tax Invoice (فاتورة ضريبية)'}
                  </span>
                  <h2 className="text-2xl font-black font-mono text-gray-900 tracking-tight">
                    {invoiceNumber}
                  </h2>
                  <div className="mt-2 text-xs space-y-1 text-gray-600 text-right">
                    <p><strong>Invoice Date:</strong> {new Date(invoiceDate).toLocaleDateString()}</p>
                    <p><strong>Due Date:</strong> {new Date(dueDate).toLocaleDateString()}</p>
                    {invoiceData.payment_terms && <p><strong>Terms:</strong> {invoiceData.payment_terms}</p>}
                  </div>
                </div>
              </div>

              {/* ===== 2. STATUS STAMP & CUSTOMER DETAILS ===== */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
                {/* Customer Box */}
                <div className="sm:col-span-2">
                  <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Bill To (العميل)</span>
                  <h3 className="text-sm font-bold text-gray-900 mt-0.5">{customerName}</h3>
                  {customerPhone && <p className="text-xs text-gray-600 mt-0.5">Phone: {customerPhone}</p>}
                  {customerAddress && <p className="text-xs text-gray-600">{customerAddress}</p>}
                  {customerTaxId && <p className="text-xs text-gray-600 font-mono">Tax ID: {customerTaxId}</p>}
                </div>

                {/* Official Stamp */}
                <div className="flex sm:justify-end items-center">
                  {status === 'PAID' ? (
                    <div className="border-4 border-emerald-600 rounded-lg p-2.5 text-center text-emerald-700 rotate-[-4deg] bg-emerald-50/60 shadow-sm">
                      <div className="text-lg font-black tracking-widest uppercase">PAID</div>
                      <div className="text-[9px] font-bold uppercase border-t border-emerald-400 mt-1 pt-0.5">
                        {payments[0]?.payment_method || invoiceData.payment_method || 'Settled'}
                      </div>
                      <div className="text-[8px] text-emerald-800">
                        {new Date(invoiceDate).toLocaleDateString()}
                      </div>
                    </div>
                  ) : status === 'POSTED' ? (
                    <div className="border-2 border-amber-500 rounded-lg p-2 text-center text-amber-800 bg-amber-50 w-full">
                      <div className="text-xs font-bold uppercase">Payment Due</div>
                      <div className="text-sm font-black font-mono mt-0.5">{formatMoney(amountDue, curr)}</div>
                      <div className="text-[9px] text-amber-700 mt-0.5">Due: {new Date(dueDate).toLocaleDateString()}</div>
                    </div>
                  ) : (
                    <div className="border-2 border-gray-400 border-dashed rounded-lg p-2 text-center text-gray-500 bg-gray-100 w-full">
                      <div className="text-xs font-bold uppercase">Draft Document</div>
                      <div className="text-[9px] mt-0.5">Not an official payment request</div>
                    </div>
                  )}
                </div>
              </div>

              {/* ===== 3. LINE ITEMS TABLE ===== */}
              <div className="mb-6 overflow-hidden rounded border border-gray-300">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 border-b border-gray-300 text-gray-700 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3 w-8 text-center">#</th>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3 text-center">Batch</th>
                      <th className="py-2.5 px-3 text-center w-14">Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Disc %</th>
                      <th className="py-2.5 px-3 text-right">Tax</th>
                      <th className="py-2.5 px-3 text-right w-24">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map((itm: any, idx: number) => (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}>
                        <td className="py-2 px-3 text-center text-gray-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="py-2 px-3 font-medium text-gray-900">{itm.label}</td>
                        <td className="py-2 px-3 text-center font-mono text-[11px] text-gray-600">{itm.batchNumber}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-gray-800">{itm.quantity}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-700">{formatMoney(itm.unitPrice, curr)}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-500">{itm.discountPercent > 0 ? `${itm.discountPercent}%` : '-'}</td>
                        <td className="py-2 px-3 text-right font-mono text-gray-500">{itm.taxPercent > 0 ? `${itm.taxPercent}%` : '0%'}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-gray-900">{formatMoney(itm.lineTotal, curr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ===== 4. TOTALS & FINANCIAL SUMMARY ===== */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-6">
                {/* Payment History / Remittance Details */}
                <div className="flex-1 text-xs">
                  {payments.length > 0 ? (
                    <div className="bg-gray-50 border border-gray-200 rounded p-3">
                      <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Payments Recorded</span>
                      <div className="mt-1.5 space-y-1">
                        {payments.map((p: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-[11px]">
                            <span className="text-gray-700">
                              • {new Date(p.payment_date || invoiceDate).toLocaleDateString()} ({p.payment_method})
                              {p.reference ? ` - Ref: ${p.reference}` : ''}
                            </span>
                            <span className="font-mono font-bold text-emerald-700">{formatMoney(p.amount, curr)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded p-3">
                      <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Payment Instructions</span>
                      <p className="text-[11px] text-gray-700 mt-1">
                        Bank: <strong>{profile.bank_name || 'Bank of Khartoum (Bankak)'}</strong>
                      </p>
                      <p className="text-[11px] text-gray-700">
                        Account No: <strong className="font-mono">{profile.bank_account_number || '1234567'}</strong>
                      </p>
                    </div>
                  )}

                  {invoiceData.notes && (
                    <p className="mt-2 text-xs text-gray-600 italic">
                      Notes: {invoiceData.notes}
                    </p>
                  )}
                </div>

                {/* Totals Breakdown */}
                <div className="w-full sm:w-72 bg-gray-50 border border-gray-200 rounded p-3 text-xs space-y-1.5">
                  <div className="flex justify-between text-gray-600">
                    <span>Untaxed Subtotal:</span>
                    <span className="font-mono">{formatMoney(subtotal, curr)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount:</span>
                      <span className="font-mono">-{formatMoney(discountAmount, curr)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>Taxes / VAT (0%):</span>
                    <span className="font-mono">{formatMoney(taxAmount, curr)}</span>
                  </div>
                  <div className="border-t border-gray-300 pt-1.5 flex justify-between font-black text-sm text-gray-900">
                    <span>Total Amount:</span>
                    <span className="font-mono text-base">{formatMoney(totalAmount, curr)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700 border-t border-dashed border-gray-300 pt-1">
                    <span>Amount Paid:</span>
                    <span className="font-mono text-emerald-700 font-bold">{formatMoney(amountPaid, curr)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900">
                    <span>Balance Due:</span>
                    <span className={`font-mono ${amountDue > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                      {formatMoney(amountDue, curr)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== 5. FOOTER & LEGAL NOTICE ===== */}
            <div className="border-t border-gray-300 pt-4 mt-8 flex justify-between items-center text-[10px] text-gray-500">
              <div className="flex-1 pr-4">
                <p>{profile.invoice_terms}</p>
                <p className="mt-0.5 text-gray-400">Generated by Pharmacy ERP System • Standard Tax Compliant Invoice</p>
              </div>

              {/* Verification Stamp / Simple QR Mockup */}
              <div className="flex items-center gap-2 border border-gray-300 rounded p-1.5 bg-gray-50">
                <div className="w-10 h-10 bg-gray-900 text-white flex items-center justify-center font-mono font-bold text-[8px] text-center leading-none">
                  TAX<br/>QR
                </div>
                <div className="text-[9px] leading-tight text-gray-600">
                  <p className="font-bold">ZATCA / Tax Verified</p>
                  <p className="font-mono text-[8px] text-gray-400">{invoiceNumber}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
