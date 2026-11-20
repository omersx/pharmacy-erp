'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, Check, Printer, Download, CreditCard, RotateCcw, 
  Trash2, Plus, AlertCircle, FileText, Calendar, Building, 
  User as UserIcon, Loader2, ArrowLeft, ChevronRight 
} from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { A4InvoiceModal } from './A4InvoiceModal';
import { RegisterPaymentModal } from './RegisterPaymentModal';

interface InvoiceDetailModalProps {
  open: boolean;
  onClose: () => void;
  invoiceId?: string | null;
  onRefresh: () => void;
}

interface FormItem {
  id?: string;
  label: string;
  medicine_id?: string;
  batch_id?: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  line_total: number;
}

export function InvoiceDetailModal({
  open,
  onClose,
  invoiceId,
  onRefresh,
}: InvoiceDetailModalProps) {
  const { currency } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<any | null>(null);

  // Form State (for Draft or New)
  const isNew = !invoiceId;
  const isDraft = isNew || invoice?.status === 'DRAFT';

  const [customers, setCustomers] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentTerms, setPaymentTerms] = useState('Immediate Payment');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<FormItem[]>([]);

  // Sub-modals
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);

  useEffect(() => {
    if (open) {
      loadInitialData();
    }
  }, [open, invoiceId]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [custs, meds] = await Promise.all([
        api.getCustomers().catch(() => []),
        api.getMedicines().catch(() => []),
      ]);
      setCustomers(Array.isArray(custs) ? custs : []);
      setMedicines(Array.isArray(meds) ? meds : []);

      if (invoiceId) {
        const inv: any = await api.getInvoice(invoiceId);
        setInvoice(inv);
        setCustomerId(inv.customer_id);
        setInvoiceDate(inv.invoice_date?.split('T')[0] || new Date().toISOString().split('T')[0]);
        setDueDate(inv.due_date?.split('T')[0] || new Date().toISOString().split('T')[0]);
        setPaymentTerms(inv.payment_terms || 'Immediate Payment');
        setNotes(inv.notes || '');
        setItems(
          (inv.items || []).map((itm: any) => ({
            id: itm.id,
            label: itm.label,
            medicine_id: itm.medicine_id,
            batch_id: itm.batch_id,
            quantity: Number(itm.quantity),
            unit_price: Number(itm.unit_price),
            discount_percent: Number(itm.discount_percent || 0),
            tax_percent: Number(itm.tax_percent || 0),
            line_total: Number(itm.line_total),
          }))
        );
      } else {
        // Reset for new invoice
        setInvoice(null);
        setCustomerId((custs as any[])[0]?.id || '');
        setInvoiceDate(new Date().toISOString().split('T')[0]);
        setDueDate(new Date().toISOString().split('T')[0]);
        setPaymentTerms('30 Days Net');
        setNotes('');
        setItems([
          {
            label: '',
            quantity: 1,
            unit_price: 0,
            discount_percent: 0,
            tax_percent: 0,
            line_total: 0,
          },
        ]);
      }
    } catch (err: any) {
      toast.error('Failed to load invoice data');
    } finally {
      setLoading(false);
    }
  };

  const handleMedicineSelect = (idx: number, medId: string) => {
    const med = medicines.find((m) => m.id === medId);
    if (!med) return;

    setItems((prev) => {
      const copy = [...prev];
      const price = Number(med.price || med.selling_price || 0);
      const qty = copy[idx].quantity || 1;
      const total = qty * price;
      copy[idx] = {
        ...copy[idx],
        medicine_id: med.id,
        label: med.name_en || med.name_ar || 'Medicine',
        unit_price: price,
        line_total: total,
      };
      return copy;
    });
  };

  const updateItemRow = (idx: number, field: keyof FormItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };

      const qty = Number(copy[idx].quantity || 0);
      const price = Number(copy[idx].unit_price || 0);
      const disc = Number(copy[idx].discount_percent || 0);
      const base = qty * price;
      const afterDisc = base - (base * disc) / 100;
      copy[idx].line_total = afterDisc;
      return copy;
    });
  };

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        label: '',
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        tax_percent: 0,
        line_total: 0,
      },
    ]);
  };

  const removeItemRow = (idx: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Compute live totals
  const subtotal = items.reduce((sum, itm) => sum + (itm.line_total || 0), 0);
  const totalAmount = subtotal;
  const curr = invoice?.currency || currency || 'SDG';

  // Actions
  const handleSaveDraft = async () => {
    if (!customerId) {
      toast.error('Please select a customer');
      return;
    }
    const validItems = items.filter((itm) => itm.label.trim() && itm.quantity > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one line item with a description and quantity');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const created = await api.createInvoice({
          customer_id: customerId,
          invoice_date: new Date(invoiceDate).toISOString(),
          due_date: new Date(dueDate).toISOString(),
          payment_terms: paymentTerms,
          currency: curr,
          notes,
          items: validItems,
        });
        toast.success('Draft invoice created successfully!');
        setInvoice(created);
        onRefresh();
      } else {
        const updated = await api.updateInvoice(invoice.id, {
          customer_id: customerId,
          invoice_date: new Date(invoiceDate).toISOString(),
          due_date: new Date(dueDate).toISOString(),
          payment_terms: paymentTerms,
          notes,
          items: validItems,
        });
        toast.success('Draft invoice updated!');
        setInvoice(updated);
        onRefresh();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!invoice?.id) {
      await handleSaveDraft();
    }
    setSaving(true);
    try {
      const confirmed: any = await api.confirmInvoice(invoice?.id);
      toast.success(`Invoice Confirmed and Posted as ${confirmed.invoice_number}!`);
      setInvoice(confirmed);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to confirm invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDraft = async () => {
    if (!invoice?.id) return;
    setSaving(true);
    try {
      const reset = await api.resetInvoiceToDraft(invoice.id);
      toast.success('Invoice reset to DRAFT state');
      setInvoice(reset);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset to draft');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelInvoice = async () => {
    if (!invoice?.id) return;
    if (!confirm('Are you sure you want to cancel this invoice?')) return;
    setSaving(true);
    try {
      const cancelled = await api.cancelInvoice(invoice.id);
      toast.success('Invoice marked as CANCELLED');
      setInvoice(cancelled);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel invoice');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const status = invoice?.status || 'DRAFT';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-background text-foreground border border-border w-full max-w-5xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] my-auto">
        
        {/* ===== TOP STATUS & ACTION BAR (Odoo Parity) ===== */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3.5 border-b border-border bg-surface gap-3">
          {/* Action Buttons based on Invoice State */}
          <div className="flex items-center gap-2 flex-wrap">
            {status === 'DRAFT' && (
              <>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={saving}
                  className="px-4 py-1.5 bg-pos-500 hover:bg-pos-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  <span>Confirm (Post Invoice)</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="px-3.5 py-1.5 bg-surface border border-border hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-xs font-medium transition-colors"
                >
                  Save Draft
                </button>
              </>
            )}

            {status === 'POSTED' && (
              <>
                <button
                  type="button"
                  onClick={() => setPayModalOpen(true)}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <CreditCard size={14} />
                  <span>Register Payment</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalOpen(true)}
                  className="px-3.5 py-1.5 bg-surface border border-border hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Printer size={14} />
                  <span>Print A4</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetToDraft}
                  className="px-3 py-1.5 text-foreground/70 hover:text-foreground text-xs hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                >
                  Reset to Draft
                </button>
              </>
            )}

            {status === 'PAID' && (
              <button
                type="button"
                onClick={() => setPrintModalOpen(true)}
                className="px-4 py-1.5 bg-pos-500 hover:bg-pos-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Printer size={14} />
                <span>Print Official A4 Invoice</span>
              </button>
            )}

            {status !== 'CANCELLED' && status !== 'PAID' && (
              <button
                type="button"
                onClick={handleCancelInvoice}
                className="px-3 py-1.5 text-red-500 hover:bg-red-500/10 rounded-lg text-xs transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Odoo State Breadcrumb: [Draft] -> [Posted] -> [Paid] */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1 text-xs">
            <span
              className={`px-3 py-1 rounded font-medium transition-colors ${
                status === 'DRAFT'
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-500/20'
                  : 'text-foreground/50'
              }`}
            >
              Draft
            </span>
            <ChevronRight size={14} className="text-foreground/30" />
            <span
              className={`px-3 py-1 rounded font-medium transition-colors ${
                status === 'POSTED'
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20'
                  : 'text-foreground/50'
              }`}
            >
              Posted
            </span>
            <ChevronRight size={14} className="text-foreground/30" />
            <span
              className={`px-3 py-1 rounded font-medium transition-colors ${
                status === 'PAID'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20'
                  : 'text-foreground/50'
              }`}
            >
              Paid
            </span>
            {status === 'CANCELLED' && (
              <>
                <ChevronRight size={14} className="text-foreground/30" />
                <span className="px-3 py-1 rounded font-bold bg-red-500/10 text-red-600 border border-red-500/20">
                  Cancelled
                </span>
              </>
            )}

            <button
              onClick={onClose}
              className="p-1 text-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-full ml-2"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ===== FORM BODY ===== */}
        {loading ? (
          <div className="p-16 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-pos-500" />
          </div>
        ) : (
          <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
            {/* Header Document Number Title */}
            <div className="flex flex-wrap justify-between items-baseline gap-2">
              <div>
                <span className="text-[11px] font-bold uppercase text-foreground/60 tracking-wider">
                  Customer Invoice
                </span>
                <h1 className="text-2xl font-black font-mono mt-0.5 text-foreground">
                  {invoice?.invoice_number || 'Draft'}
                </h1>
              </div>

              {invoice?.source_type === 'POS' && (
                <div className="px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-600 text-[11px] font-medium">
                  Source: POS Counter Sale
                </div>
              )}
            </div>

            {/* Customer & Meta Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-surface border border-border">
              {/* Customer */}
              <div className="lg:col-span-2">
                <label className="block font-medium text-foreground/70 mb-1">Customer</label>
                {isDraft ? (
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500 font-medium"
                  >
                    <option value="">Select a customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="font-bold text-sm text-foreground pt-1">{invoice?.customer_name}</p>
                )}
              </div>

              {/* Invoice Date */}
              <div>
                <label className="block font-medium text-foreground/70 mb-1">Invoice Date</label>
                {isDraft ? (
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                  />
                ) : (
                  <p className="font-medium text-foreground pt-1">{new Date(invoiceDate).toLocaleDateString()}</p>
                )}
              </div>

              {/* Due Date & Terms */}
              <div>
                <label className="block font-medium text-foreground/70 mb-1">Due Date / Terms</label>
                {isDraft ? (
                  <div className="space-y-1.5">
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                    />
                    <select
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                      className="w-full bg-background border border-border rounded px-2 py-1 text-[11px] text-foreground focus:outline-none"
                    >
                      <option value="Immediate Payment">Immediate Payment</option>
                      <option value="15 Days">15 Days Net</option>
                      <option value="30 Days">30 Days Net</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-foreground pt-1">{new Date(dueDate).toLocaleDateString()}</p>
                    <p className="text-[11px] text-foreground/60">{invoice?.payment_terms}</p>
                  </div>
                )}
              </div>
            </div>

            {/* ===== INVOICE LINES TABLE ===== */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-foreground text-sm">Invoice Lines</h3>
                {isDraft && (
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="px-2.5 py-1 bg-pos-500/10 hover:bg-pos-500/20 text-pos-600 dark:text-pos-300 rounded font-medium flex items-center gap-1 transition-colors"
                  >
                    <Plus size={13} />
                    <span>Add a line</span>
                  </button>
                )}
              </div>

              <div className="border border-border rounded-lg overflow-hidden bg-surface">
                <table className="w-full text-left text-xs">
                  <thead className="bg-background/80 border-b border-border text-foreground/70 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3 w-8 text-center">#</th>
                      <th className="py-2 px-3">Description / Medicine</th>
                      <th className="py-2 px-3 text-center w-24">Qty</th>
                      <th className="py-2 px-3 text-right w-32">Unit Price</th>
                      <th className="py-2 px-3 text-right w-24">Disc %</th>
                      <th className="py-2 px-3 text-right w-32">Amount</th>
                      {isDraft && <th className="py-2 px-3 w-10 text-center"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((row, idx) => (
                      <tr key={idx} className="hover:bg-background/40 transition-colors">
                        <td className="py-2 px-3 text-center text-foreground/40 font-mono text-[11px]">
                          {idx + 1}
                        </td>

                        {/* Description / Medicine Picker */}
                        <td className="py-2 px-3">
                          {isDraft ? (
                            <div className="space-y-1">
                              <input
                                type="text"
                                placeholder="Label / Service or select medicine..."
                                value={row.label}
                                onChange={(e) => updateItemRow(idx, 'label', e.target.value)}
                                className="w-full bg-background border border-border rounded px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500 font-medium"
                              />
                              <select
                                onChange={(e) => handleMedicineSelect(idx, e.target.value)}
                                className="w-full bg-background/50 border border-border/60 rounded px-2 py-0.5 text-[11px] text-foreground/70"
                              >
                                <option value="">Select from catalog...</option>
                                {medicines.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name_en || m.name_ar} - {formatMoney(m.price || m.selling_price || 0, curr)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <p className="font-medium text-foreground">{row.label}</p>
                              {row.batch_id && (
                                <p className="text-[10px] font-mono text-foreground/60">Batch: {row.batch_id}</p>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Qty */}
                        <td className="py-2 px-3 text-center">
                          {isDraft ? (
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={row.quantity}
                              onChange={(e) => updateItemRow(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-20 text-center bg-background border border-border rounded px-2 py-1 font-mono font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                            />
                          ) : (
                            <span className="font-mono font-bold text-foreground">{row.quantity}</span>
                          )}
                        </td>

                        {/* Unit Price */}
                        <td className="py-2 px-3 text-right">
                          {isDraft ? (
                            <input
                              type="number"
                              step="any"
                              value={row.unit_price}
                              onChange={(e) => updateItemRow(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-28 text-right bg-background border border-border rounded px-2 py-1 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                            />
                          ) : (
                            <span className="font-mono text-foreground">{formatMoney(row.unit_price, curr)}</span>
                          )}
                        </td>

                        {/* Disc % */}
                        <td className="py-2 px-3 text-right">
                          {isDraft ? (
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              value={row.discount_percent}
                              onChange={(e) => updateItemRow(idx, 'discount_percent', parseFloat(e.target.value) || 0)}
                              className="w-16 text-right bg-background border border-border rounded px-2 py-1 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                            />
                          ) : (
                            <span className="font-mono text-foreground/70">{row.discount_percent}%</span>
                          )}
                        </td>

                        {/* Line Total */}
                        <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                          {formatMoney(row.line_total, curr)}
                        </td>

                        {/* Delete Row */}
                        {isDraft && (
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeItemRow(idx)}
                              className="p-1 text-foreground/40 hover:text-red-500 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ===== FINANCIAL TOTALS & NOTES ===== */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-6 pt-2">
              {/* Notes */}
              <div className="flex-1 w-full">
                <label className="block font-medium text-foreground/70 mb-1">Terms and Conditions / Notes</label>
                {isDraft ? (
                  <textarea
                    rows={3}
                    placeholder="Add an invoice note or payment instructions..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-surface border border-border rounded-lg p-2.5 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500 resize-none text-xs"
                  />
                ) : (
                  <p className="text-foreground/80 italic p-3 bg-surface border border-border rounded-lg">
                    {invoice?.notes || 'No extra notes provided.'}
                  </p>
                )}
              </div>

              {/* Totals */}
              <div className="w-full md:w-80 p-4 bg-surface border border-border rounded-xl space-y-2">
                <div className="flex justify-between text-foreground/70">
                  <span>Untaxed Amount:</span>
                  <span className="font-mono">{formatMoney(subtotal, curr)}</span>
                </div>
                <div className="flex justify-between text-foreground/70">
                  <span>Taxes (0%):</span>
                  <span className="font-mono">{formatMoney(0, curr)}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-black text-base text-foreground">
                  <span>Total Amount:</span>
                  <span className="font-mono">{formatMoney(totalAmount, curr)}</span>
                </div>

                {!isNew && (
                  <>
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold border-t border-dashed border-border pt-1.5">
                      <span>Amount Paid:</span>
                      <span className="font-mono">{formatMoney(invoice?.amount_paid || 0, curr)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-foreground">
                      <span>Amount Due:</span>
                      <span className={`font-mono ${Number(invoice?.amount_due) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                        {formatMoney(invoice?.amount_due || 0, curr)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sub-modals */}
      <A4InvoiceModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        invoiceData={invoice}
      />

      <RegisterPaymentModal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        invoice={invoice}
        onPaymentSuccess={() => {
          loadInitialData();
          onRefresh();
        }}
      />
    </div>
  );
}
