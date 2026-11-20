'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, Printer, Download, Share2, Calendar, Filter, 
  DollarSign, CheckCircle2, AlertCircle, Clock, 
  TrendingUp, Wallet, ArrowDownRight, ArrowUpRight,
  RefreshCw, Building2, User, Phone, MapPin, ExternalLink
} from 'lucide-react';
import { formatMoney } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { api } from '@/lib/api';
import { toast } from 'react-hot-toast';

interface CustomerStatementModalProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName?: string;
  onOpenPaymentModal?: () => void;
}

export function CustomerStatementModal({
  open,
  onClose,
  customerId,
  customerName,
  onOpenPaymentModal,
}: CustomerStatementModalProps) {
  const { currency } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [statementData, setStatementData] = useState<any>(null);
  
  // Date filters
  const [presetRange, setPresetRange] = useState<'ALL' | 'THIS_MONTH' | 'LAST_30' | 'YTD' | 'CUSTOM'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INVOICES' | 'PAYMENTS'>('ALL');

  useEffect(() => {
    if (open && customerId) {
      applyPreset('ALL');
    }
  }, [open, customerId]);

  const fetchStatement = async (start?: string, end?: string) => {
    setLoading(true);
    try {
      const data = await api.getCustomerStatement(customerId, {
        start_date: start || undefined,
        end_date: end || undefined,
      });
      setStatementData(data);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load statement of account');
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: 'ALL' | 'THIS_MONTH' | 'LAST_30' | 'YTD' | 'CUSTOM') => {
    setPresetRange(preset);
    const now = new Date();
    let start = '';
    let end = now.toISOString().split('T')[0];

    if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      start = firstDay.toISOString().split('T')[0];
    } else if (preset === 'LAST_30') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      start = thirtyDaysAgo.toISOString().split('T')[0];
    } else if (preset === 'YTD') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      start = startOfYear.toISOString().split('T')[0];
    } else if (preset === 'ALL') {
      start = '';
      end = '';
    }

    setStartDate(start);
    setEndDate(end);
    fetchStatement(start ? new Date(start).toISOString() : undefined, end ? new Date(`${end}T23:59:59`).toISOString() : undefined);
  };

  const handleCustomFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStatement(
      startDate ? new Date(startDate).toISOString() : undefined,
      endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined
    );
  };

  // Filter entries based on typeFilter
  const filteredEntries = useMemo(() => {
    if (!statementData?.entries) return [];
    if (typeFilter === 'INVOICES') {
      return statementData.entries.filter((e: any) => e.type === 'INVOICE' || e.type === 'POS_SALE');
    }
    if (typeFilter === 'PAYMENTS') {
      return statementData.entries.filter((e: any) => e.type === 'PAYMENT');
    }
    return statementData.entries;
  }, [statementData, typeFilter]);

  if (!open) return null;

  const profile = statementData?.pharmacy_profile || {
    name_en: 'Grand Nile Pharmacy',
    name_ar: 'صيدلية النيل الكبرى',
    tax_number: '300123456700003',
    cr_number: '1010482910',
    phone: '+249 91 234 5678',
    email: 'info@grandnile-pharma.com',
    address: 'Al-Siteen Street, Khartoum',
    bank_name: 'Bank of Khartoum (Bankak)',
    bank_account_number: '1234567',
    currency: 'SDG',
  };

  const customer = statementData?.customer || {
    name: customerName || 'Customer',
    phone: '-',
    email: null,
    address: null,
    credit_limit: 0,
    credit_balance: 0,
  };

  const summary = statementData?.summary || {
    opening_balance: 0,
    total_debits: 0,
    total_credits: 0,
    net_period_change: 0,
    closing_balance: customer.credit_balance || 0,
    credit_limit: customer.credit_limit || 0,
    available_credit: Math.max(0, (customer.credit_limit || 0) - (customer.credit_balance || 0)),
  };

  const aging = statementData?.aging || {
    current_30_days: summary.closing_balance,
    days_31_to_60: 0,
    days_61_to_90: 0,
    over_90_days: 0,
    total_outstanding: summary.closing_balance,
  };

  const curr = profile.currency || currency || 'SDG';

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    const rawPhone = customer.phone || '';
    const cleanPhone = rawPhone.replace(/[^0-9]/g, '');
    const periodStr = startDate && endDate ? `${startDate} to ${endDate}` : 'All Time / كل الفترات';

    const messageText = 
`*كشف حساب عميل | STATEMENT OF ACCOUNT*
🏥 *${profile.name_ar || profile.name_en}*
----------------------------------------
👤 *العميل:* ${customer.name || customer.name_ar}
📅 *الفترة:* ${periodStr}
💰 *الرصيد الافتتاحي:* ${formatMoney(summary.opening_balance)} ${curr}
➕ *إجمالي المشتريات/الفواتير:* ${formatMoney(summary.total_debits)} ${curr}
➖ *إجمالي السدادات والمقبوضات:* ${formatMoney(summary.total_credits)} ${curr}
----------------------------------------
🔴 *صافي الرصيد المستحق الدفع:* *${formatMoney(summary.closing_balance)} ${curr}*
----------------------------------------
🏦 *بيانات الحساب البنكي للسداد (بنكك):*
- البنك: ${profile.bank_name || 'Bank of Khartoum'}
- رقم الحساب: *${profile.bank_account_number || '-'}*
- باسم: ${profile.name_ar || profile.name_en}

شاكرين ومقدرين حسن تعاملكم معنا.`;

    const waUrl = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`
      : `https://wa.me/?text=${encodeURIComponent(messageText)}`;
    window.open(waUrl, '_blank');
  };

  // Aging distribution percentages
  const agingTotal = Number(aging.total_outstanding || 1);
  const pctCurrent = Math.min(100, Math.round((Number(aging.current_30_days || 0) / agingTotal) * 100));
  const pct31_60 = Math.min(100, Math.round((Number(aging.days_31_to_60 || 0) / agingTotal) * 100));
  const pct61_90 = Math.min(100, Math.round((Number(aging.days_61_to_90 || 0) / agingTotal) * 100));
  const pctOver90 = Math.min(100, Math.max(0, 100 - pctCurrent - pct31_60 - pct61_90));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 overflow-y-auto backdrop-blur-sm">
      <div className="bg-background text-foreground border border-border w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] my-auto">
        
        {/* Top Control Bar (Screen only, hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border bg-[#111A2C] print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">Statement of Account / كشف حساب عميل</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 font-medium">
                  ERP Parity
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Customer: <span className="font-semibold text-foreground">{customer.name}</span>
                {customer.phone && <span className="ml-2">({customer.phone})</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenPaymentModal && (
              <button
                onClick={onOpenPaymentModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Add Payment</span>
              </button>
            )}
            
            <button
              onClick={handleWhatsAppShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all"
              title="Share statement summary on WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-500 hover:bg-brand-600 text-white shadow-md shadow-brand-500/20 transition-all"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print A4 / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter and Period Selection Bar (Screen only) */}
        <div className="px-6 py-3 border-b border-border bg-[#162032] flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 bg-black/20 p-1 rounded-xl border border-border">
            {[
              { id: 'ALL', label: 'All Time' },
              { id: 'THIS_MONTH', label: 'This Month' },
              { id: 'LAST_30', label: 'Last 30 Days' },
              { id: 'YTD', label: 'Year to Date' },
              { id: 'CUSTOM', label: 'Custom' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id as any)}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  presetRange === p.id
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Form */}
          {presetRange === 'CUSTOM' && (
            <form onSubmit={handleCustomFilterSubmit} className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-black/30 border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-black/30 border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30 border border-brand-500/40 font-semibold"
              >
                Apply
              </button>
            </form>
          )}

          {/* Type Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Show:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="bg-black/30 border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:ring-1 focus:ring-brand-500"
            >
              <option value="ALL">All Entries (Invoices + Payments)</option>
              <option value="INVOICES">Invoices Only (Debits)</option>
              <option value="PAYMENTS">Payments Only (Credits)</option>
            </select>
          </div>
        </div>

        {/* Scrollable Document Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface/30">
          
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <RefreshCw className="w-8 h-8 animate-spin text-brand-400" />
              <p className="text-sm font-medium">Calculating ledger and aging receivables...</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Screen Summary KPI Cards (Hidden on print) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
                <div className="bg-[#111A2C] border border-border p-3.5 rounded-xl flex flex-col justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-400" /> Opening Balance
                  </span>
                  <div className="mt-2 text-lg font-bold text-foreground">
                    {formatMoney(summary.opening_balance)} <span className="text-xs text-muted-foreground font-normal">{curr}</span>
                  </div>
                </div>

                <div className="bg-[#111A2C] border border-border p-3.5 rounded-xl flex flex-col justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ArrowDownRight className="w-3.5 h-3.5 text-amber-400" /> Invoiced (+)
                  </span>
                  <div className="mt-2 text-lg font-bold text-amber-400">
                    +{formatMoney(summary.total_debits)} <span className="text-xs text-muted-foreground font-normal">{curr}</span>
                  </div>
                </div>

                <div className="bg-[#111A2C] border border-border p-3.5 rounded-xl flex flex-col justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> Payments Received (-)
                  </span>
                  <div className="mt-2 text-lg font-bold text-emerald-400">
                    -{formatMoney(summary.total_credits)} <span className="text-xs text-muted-foreground font-normal">{curr}</span>
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                  Number(summary.closing_balance) > 0 
                    ? 'bg-rose-500/10 border-rose-500/30' 
                    : 'bg-emerald-500/10 border-emerald-500/30'
                }`}>
                  <span className="text-xs font-semibold flex items-center gap-1 text-foreground">
                    <Wallet className="w-3.5 h-3.5 text-rose-400" /> Net Balance Due
                  </span>
                  <div className={`mt-2 text-xl font-black ${
                    Number(summary.closing_balance) > 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {formatMoney(summary.closing_balance)} <span className="text-xs font-normal">{curr}</span>
                  </div>
                </div>
              </div>

              {/* Debt Aging Analysis Bar (Screen only) */}
              <div className="bg-[#111A2C] border border-border p-4 rounded-xl print:hidden space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-brand-400" /> Aging Receivables Analysis / تحليل أعمار الديون
                  </span>
                  <span className="text-muted-foreground">Total Open: <strong className="text-foreground">{formatMoney(aging.total_outstanding)} {curr}</strong></span>
                </div>

                {/* Multi-segment progress bar */}
                <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden flex border border-border/50">
                  <div style={{ width: `${pctCurrent}%` }} className="bg-emerald-500 h-full" title={`0-30 Days: ${formatMoney(aging.current_30_days)}`} />
                  <div style={{ width: `${pct31_60}%` }} className="bg-amber-500 h-full" title={`31-60 Days: ${formatMoney(aging.days_31_to_60)}`} />
                  <div style={{ width: `${pct61_90}%` }} className="bg-orange-500 h-full" title={`61-90 Days: ${formatMoney(aging.days_61_to_90)}`} />
                  <div style={{ width: `${pctOver90}%` }} className="bg-rose-500 h-full" title={`90+ Days: ${formatMoney(aging.over_90_days)}`} />
                </div>

                {/* Aging Legend Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex flex-col">
                    <span className="text-emerald-400 font-medium">0 - 30 Days (جاري)</span>
                    <span className="font-bold text-foreground mt-0.5">{formatMoney(aging.current_30_days)} {curr}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex flex-col">
                    <span className="text-amber-400 font-medium">31 - 60 Days</span>
                    <span className="font-bold text-foreground mt-0.5">{formatMoney(aging.days_31_to_60)} {curr}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20 flex flex-col">
                    <span className="text-orange-400 font-medium">61 - 90 Days</span>
                    <span className="font-bold text-foreground mt-0.5">{formatMoney(aging.days_61_to_90)} {curr}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 flex flex-col">
                    <span className="text-rose-400 font-medium">90+ Days (متأخر)</span>
                    <span className="font-bold text-foreground mt-0.5">{formatMoney(aging.over_90_days)} {curr}</span>
                  </div>
                </div>
              </div>

              {/* ───────────────────────────────────────────────────────────── */}
              {/* THE OFFICIAL A4 PRINTABLE STATEMENT CANVAS                   */}
              {/* ───────────────────────────────────────────────────────────── */}
              <div 
                id="statement-a4-printable"
                className="bg-white text-slate-900 shadow-xl rounded-xl p-8 sm:p-10 font-sans border border-slate-200 print:shadow-none print:border-none print:p-0 print:m-0 print:rounded-none max-w-4xl mx-auto"
                style={{ minHeight: '1120px' }}
              >
                {/* A4 Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-800 pb-5 mb-6">
                  {/* Left: Pharmacy Brand EN */}
                  <div className="space-y-1">
                    <h1 className="text-xl font-black text-slate-900 tracking-tight">{profile.name_en}</h1>
                    <p className="text-xs text-slate-600">{profile.address || 'Khartoum, Sudan'}</p>
                    <div className="text-[11px] text-slate-500 flex flex-col gap-0.5 pt-1">
                      <span>Tel: {profile.phone || '+249 91 234 5678'}</span>
                      {profile.tax_number && <span>Tax ID: <strong>{profile.tax_number}</strong></span>}
                      {profile.cr_number && <span>CR No: <strong>{profile.cr_number}</strong></span>}
                    </div>
                  </div>

                  {/* Center: Official Statement Badge */}
                  <div className="text-center px-4 py-1.5 bg-slate-100 rounded-lg border border-slate-300">
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                      STATEMENT OF ACCOUNT
                    </h2>
                    <p className="text-xs font-bold text-slate-700 font-serif" dir="rtl">
                      كشف حساب عميل
                    </p>
                    <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                      Ref: STMT-{customerId.slice(0, 8).toUpperCase()}
                    </span>
                  </div>

                  {/* Right: Pharmacy Brand AR */}
                  <div className="text-right space-y-1" dir="rtl">
                    <h1 className="text-xl font-black text-slate-900 font-serif">{profile.name_ar}</h1>
                    <p className="text-xs text-slate-600 font-serif">السودان - الخرطوم</p>
                    <div className="text-[11px] text-slate-500 flex flex-col gap-0.5 pt-1">
                      <span>هاتف: {profile.phone || '+249 91 234 5678'}</span>
                      <span>سجل تجاري: {profile.cr_number}</span>
                    </div>
                  </div>
                </div>

                {/* Metadata Details Grid */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 text-xs">
                  <div>
                    <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1.5 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-600" /> Account Holder / العميل
                    </h3>
                    <p className="text-sm font-bold text-slate-900">{customer.name}</p>
                    {customer.name_ar && <p className="text-xs text-slate-600 font-serif">{customer.name_ar}</p>}
                    {customer.phone && <p className="text-slate-600 mt-0.5">Phone: {customer.phone}</p>}
                    {customer.address && <p className="text-slate-600">{customer.address}</p>}
                    <p className="text-slate-500 mt-1">Credit Limit: {formatMoney(customer.credit_limit)} {curr}</p>
                  </div>

                  <div className="text-right">
                    <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] mb-1.5 flex items-center justify-end gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-600" /> Statement Period / فترة الكشف
                    </h3>
                    <p className="font-semibold text-slate-900">
                      {startDate ? new Date(startDate).toLocaleDateString() : 'Beginning'} — {endDate ? new Date(endDate).toLocaleDateString() : 'Current Date'}
                    </p>
                    <p className="text-slate-500 mt-1">
                      Issue Date: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-slate-500">Currency: <strong>{curr}</strong></p>
                  </div>
                </div>

                {/* Printable Statement Financial Overview Table */}
                <div className="grid grid-cols-4 gap-2 mb-6 text-center text-xs">
                  <div className="p-2.5 bg-slate-100 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 block uppercase">Opening Balance</span>
                    <strong className="text-sm text-slate-900">{formatMoney(summary.opening_balance)} {curr}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-100 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 block uppercase">Period Debits (+)</span>
                    <strong className="text-sm text-amber-700">+{formatMoney(summary.total_debits)} {curr}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-100 rounded border border-slate-200">
                    <span className="text-[10px] text-slate-500 block uppercase">Period Credits (-)</span>
                    <strong className="text-sm text-emerald-700">-{formatMoney(summary.total_credits)} {curr}</strong>
                  </div>
                  <div className="p-2.5 bg-slate-900 text-white rounded border border-slate-900">
                    <span className="text-[10px] text-slate-300 block uppercase">Ending Balance Due</span>
                    <strong className="text-sm text-white">{formatMoney(summary.closing_balance)} {curr}</strong>
                  </div>
                </div>

                {/* Detailed Statement Table */}
                <div className="border border-slate-200 rounded-lg overflow-hidden mb-6">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-800 text-white text-[11px] uppercase tracking-wider font-semibold">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Reference</th>
                        <th className="py-2.5 px-3">Description / Details</th>
                        <th className="py-2.5 px-3 text-right">Debit (+)</th>
                        <th className="py-2.5 px-3 text-right">Credit (-)</th>
                        <th className="py-2.5 px-3 text-right font-bold">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800">
                      {/* Row 0: Opening Balance */}
                      <tr className="bg-slate-50/80 font-medium text-slate-600 italic">
                        <td className="py-2 px-3 whitespace-nowrap">
                          {startDate ? new Date(startDate).toLocaleDateString() : '-'}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">OPENING</td>
                        <td className="py-2 px-3">Opening Balance brought forward / رصيد افتتاحي</td>
                        <td className="py-2 px-3 text-right">-</td>
                        <td className="py-2 px-3 text-right">-</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">
                          {formatMoney(summary.opening_balance)}
                        </td>
                      </tr>

                      {/* Dynamic Entries */}
                      {filteredEntries.map((row: any, idx: number) => {
                        const isDebit = Number(row.debit || 0) > 0;
                        const isCredit = Number(row.credit || 0) > 0;
                        const dateFormatted = new Date(row.date).toLocaleDateString();

                        return (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                              {dateFormatted}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 text-[11px]">
                              {row.reference}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-medium text-slate-900">{row.description}</span>
                              {row.due_date && (
                                <span className="block text-[10px] text-slate-500">
                                  Due: {new Date(row.due_date).toLocaleDateString()}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right text-amber-800 font-medium whitespace-nowrap">
                              {isDebit ? formatMoney(row.debit) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right text-emerald-800 font-medium whitespace-nowrap">
                              {isCredit ? formatMoney(row.credit) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                              {formatMoney(row.running_balance)}
                            </td>
                          </tr>
                        );
                      })}

                      {filteredEntries.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                            No ledger transactions recorded in this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                        <td colSpan={3} className="py-3 px-3 uppercase text-[11px] tracking-wider">
                          Statement Period Totals & Final Net Due:
                        </td>
                        <td className="py-3 px-3 text-right text-amber-900 whitespace-nowrap">
                          +{formatMoney(summary.total_debits)}
                        </td>
                        <td className="py-3 px-3 text-right text-emerald-900 whitespace-nowrap">
                          -{formatMoney(summary.total_credits)}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-sm whitespace-nowrap bg-slate-200">
                          {formatMoney(summary.closing_balance)} {curr}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Aging Analysis Table on Printout */}
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 mb-6 text-xs">
                  <div className="font-bold text-slate-800 uppercase text-[11px] mb-2 flex justify-between">
                    <span>Aging Receivables Breakdown / تحليل أعمار الديون</span>
                    <span className="font-normal text-slate-500">Calculated as of {new Date().toLocaleDateString()}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-slate-500 block">0 - 30 Days</span>
                      <strong className="text-slate-900">{formatMoney(aging.current_30_days)} {curr}</strong>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-slate-500 block">31 - 60 Days</span>
                      <strong className="text-slate-900">{formatMoney(aging.days_31_to_60)} {curr}</strong>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-slate-500 block">61 - 90 Days</span>
                      <strong className="text-slate-900">{formatMoney(aging.days_61_to_90)} {curr}</strong>
                    </div>
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <span className="text-slate-500 block">Over 90 Days</span>
                      <strong className="text-slate-900">{formatMoney(aging.over_90_days)} {curr}</strong>
                    </div>
                  </div>
                </div>

                {/* Payment Instructions / Bank Info */}
                <div className="border border-dashed border-slate-300 rounded-lg p-3.5 mb-8 bg-slate-50/50 text-xs flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-slate-900 mb-0.5">Payment Instructions / بيانات التحويل البنكي</h4>
                    <p className="text-slate-600">
                      Please transfer to: <strong>{profile.bank_name || 'Bank of Khartoum (Bankak)'}</strong> | Account No: <strong className="font-mono text-sm">{profile.bank_account_number || '-'}</strong>
                    </p>
                    <p className="text-slate-500 text-[11px]">Beneficiary Name: {profile.name_ar || profile.name_en}</p>
                  </div>
                  <div className="text-right text-[11px] text-slate-400">
                    <p>Send proof of transfer to:</p>
                    <p className="font-bold text-slate-700">{profile.phone || '+249 91 234 5678'}</p>
                  </div>
                </div>

                {/* Sign-off / Verification Section */}
                <div className="grid grid-cols-2 gap-12 pt-6 border-t border-slate-200 text-xs">
                  <div className="space-y-8">
                    <div>
                      <p className="font-bold text-slate-900">Customer Acknowledgment / مصادقة العميل</p>
                      <p className="text-[10px] text-slate-500">I confirm that the above statement balance is true and accurate.</p>
                    </div>
                    <div className="border-b border-dashed border-slate-400 w-48 pt-6"></div>
                    <p className="text-[10px] text-slate-400">Authorized Signature & Date</p>
                  </div>

                  <div className="space-y-8 text-right">
                    <div>
                      <p className="font-bold text-slate-900">For {profile.name_en} / قسم الحسابات</p>
                      <p className="text-[10px] text-slate-500 font-serif" dir="rtl">صادر ومطابق من النظام المحاسبي للصيدلية</p>
                    </div>
                    <div className="border-b border-dashed border-slate-400 w-48 ml-auto pt-6"></div>
                    <p className="text-[10px] text-slate-400">Financial Controller / Official Stamp</p>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>

      </div>

      {/* Embedded CSS for flawless A4 print fidelity */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #statement-a4-printable, #statement-a4-printable * {
            visibility: visible;
          }
          #statement-a4-printable {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            min-height: 100% !important;
            margin: 0 !important;
            padding: 20mm !important;
            box-shadow: none !important;
            border: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
}
