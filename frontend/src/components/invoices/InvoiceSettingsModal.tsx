'use client';

import React, { useState, useEffect } from 'react';
import { X, Settings, Building2, Save, Loader2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface InvoiceSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function InvoiceSettingsModal({ open, onClose, onSaved }: InvoiceSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name_en: 'Grand Nile Pharmacy',
    name_ar: 'صيدلية النيل الكبرى',
    logo_url: '',
    tax_number: '300123456700003',
    cr_number: '1010482910',
    phone: '+249 91 234 5678',
    mobile: '',
    email: 'info@grandnile-pharma.com',
    address: 'Al-Siteen Street, Khartoum',
    city: 'Khartoum',
    currency: 'SDG',
    bank_name: 'Bank of Khartoum (Bankak)',
    bank_account_number: '1234567',
    bank_iban: '',
    invoice_terms: 'Medicines cannot be returned without original invoice within 3 days. / البضاعة المباعة لا ترد ولا تستبدل بعد 3 أيام إلا بالفاتورة الأصلية',
    invoice_prefix: 'INV',
  });

  useEffect(() => {
    if (open) {
      setLoading(true);
      api.getPharmacyProfile()
        .then((data: any) => {
          if (data) {
            setForm({
              name_en: data.name_en || 'Grand Nile Pharmacy',
              name_ar: data.name_ar || 'صيدلية النيل الكبرى',
              logo_url: data.logo_url || '',
              tax_number: data.tax_number || '300123456700003',
              cr_number: data.cr_number || '1010482910',
              phone: data.phone || '+249 91 234 5678',
              mobile: data.mobile || '',
              email: data.email || 'info@grandnile-pharma.com',
              address: data.address || 'Al-Siteen Street, Khartoum',
              city: data.city || 'Khartoum',
              currency: data.currency || 'SDG',
              bank_name: data.bank_name || 'Bank of Khartoum (Bankak)',
              bank_account_number: data.bank_account_number || '1234567',
              bank_iban: data.bank_iban || '',
              invoice_terms: data.invoice_terms || 'Medicines cannot be returned without original invoice within 3 days.',
              invoice_prefix: data.invoice_prefix || 'INV',
            });
          }
        })
        .catch(() => toast.error('Failed to load invoice settings'))
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updatePharmacyProfile(form);
      toast.success('Pharmacy invoice branding updated successfully!');
      if (onSaved) onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background text-foreground border border-border w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-border bg-surface">
          <div className="flex items-center gap-2">
            <Building2 className="text-pos-500" size={20} />
            <h2 className="text-base font-bold">Customize Pharmacy Invoice & Branding</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="animate-spin text-pos-500" size={32} />
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4 text-xs">
            {/* Pharmacy Names */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-foreground/80 mb-1">Pharmacy Name (English)</label>
                <input
                  type="text"
                  required
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                />
              </div>
              <div>
                <label className="block font-medium text-foreground/80 mb-1">اسم الصيدلية (عربي)</label>
                <input
                  type="text"
                  dir="rtl"
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                />
              </div>
            </div>

            {/* Tax and CR */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-medium text-foreground/80 mb-1">Tax / VAT Number (الرقم الضريبي)</label>
                <input
                  type="text"
                  value={form.tax_number}
                  onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                />
              </div>
              <div>
                <label className="block font-medium text-foreground/80 mb-1">Commercial Registration (السجل)</label>
                <input
                  type="text"
                  value={form.cr_number}
                  onChange={(e) => setForm({ ...form, cr_number: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                />
              </div>
              <div>
                <label className="block font-medium text-foreground/80 mb-1">Invoice Prefix (بادئة الفاتورة)</label>
                <input
                  type="text"
                  value={form.invoice_prefix}
                  onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value.toUpperCase() })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                  placeholder="INV"
                />
              </div>
            </div>

            {/* Address and Contacts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-foreground/80 mb-1">Address / Street</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                />
              </div>
              <div>
                <label className="block font-medium text-foreground/80 mb-1">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-foreground/80 mb-1">Phone / WhatsApp</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                />
              </div>
              <div>
                <label className="block font-medium text-foreground/80 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                />
              </div>
            </div>

            {/* Banking Details */}
            <div className="p-3 bg-surface border border-border rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-1.5">
                <span>Bank & Wire Remittance Information</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-foreground/70 mb-1">Bank Name / Wallet</label>
                  <input
                    type="text"
                    value={form.bank_name}
                    onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                    className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                    placeholder="Bank of Khartoum (Bankak)"
                  />
                </div>
                <div>
                  <label className="block font-medium text-foreground/70 mb-1">Account Number / IBAN</label>
                  <input
                    type="text"
                    value={form.bank_account_number}
                    onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })}
                    className="w-full bg-background border border-border rounded px-2.5 py-1.5 font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500"
                    placeholder="1234567"
                  />
                </div>
              </div>
            </div>

            {/* Terms and Conditions */}
            <div>
              <label className="block font-medium text-foreground/80 mb-1">Default Terms & Conditions (Footer)</label>
              <textarea
                rows={2}
                value={form.invoice_terms}
                onChange={(e) => setForm({ ...form, invoice_terms: e.target.value })}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-pos-500 resize-none"
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-border rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-pos-500 hover:bg-pos-600 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                <span>Save Settings</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
