'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import { format } from 'date-fns';
import { 
  Search, Calendar, Filter, Receipt, ArrowLeftRight, 
  ChevronRight, ChevronDown, AlertCircle, RefreshCw, X, Calculator,
  TrendingUp, TrendingDown, CheckCircle2, ArrowDownCircle,
  ArrowUpCircle, DollarSign, Clock, ShieldAlert, CreditCard,
  RotateCcw, Banknote, User as UserIcon, ExternalLink, Plus,
  FileText, Settings
} from 'lucide-react';
import { cn, formatMoney, formatDate, formatDateTime } from '@/lib/utils';
import { useTranslations, useLocale } from 'next-intl';
import * as Dialog from '@radix-ui/react-dialog';
import { ReturnModal } from './ReturnModal';
import { A4InvoiceModal } from '@/components/invoices/A4InvoiceModal';
import { InvoiceDetailModal } from '@/components/invoices/InvoiceDetailModal';
import { InvoiceSettingsModal } from '@/components/invoices/InvoiceSettingsModal';

export default function SalesHistoryPage() {
  const t = useTranslations('sales');
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<'sales' | 'invoices' | 'sessions' | 'payments'>('sales');

  const getPaymentMethodLabel = (method: string) => {
    if (!method) return '-';
    const upper = method.toUpperCase();
    try {
      return t(`paymentMethods.${upper}`);
    } catch {
      return method;
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'COMPLETED') {
      return <Badge variant="success">{t('filters.completed')}</Badge>;
    } else if (status === 'PARTIALLY_RETURNED') {
      return <Badge variant="warning">{t('filters.partiallyReturned')}</Badge>;
    } else {
      return <Badge variant="danger">{t('filters.fullyReturned')}</Badge>;
    }
  };
  
  // Sales State
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { currency } = useAppStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  // Invoices State (Odoo /odoo/customer-invoices parity)
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('ALL');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [invoiceDetailOpen, setInvoiceDetailOpen] = useState(false);
  const [invoiceSettingsOpen, setInvoiceSettingsOpen] = useState(false);
  const [a4ModalOpen, setA4ModalOpen] = useState(false);
  const [a4InvoiceData, setA4InvoiceData] = useState<any | null>(null);

  // Cash Sessions State
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [sessionSummary, setSessionSummary] = useState<any | null>(null);
  const [loadingSessionSummary, setLoadingSessionSummary] = useState(false);
  const [sessionDetailsOpen, setSessionDetailsOpen] = useState(false);

  // Payments Ledger State (Odoo /odoo/action-431 parity)
  const [paymentsLedger, setPaymentsLedger] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeTab === 'sales') {
      fetchSales();
    } else if (activeTab === 'invoices') {
      fetchInvoices();
    } else if (activeTab === 'sessions') {
      fetchSessions();
    } else if (activeTab === 'payments') {
      fetchPayments();
    }
  }, [activeTab, statusFilter, invoiceStatusFilter, sessionFilter, paymentMethodFilter]);

  const fetchInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const data: any = await api.getInvoices({
        status: invoiceStatusFilter !== 'ALL' ? invoiceStatusFilter : undefined,
        search: invoiceSearch || undefined,
      });
      setInvoices(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to load customer invoices');
    } finally {
      setLoadingInvoices(false);
    }
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      const data = await api.getSales({ status: statusFilter, search: search || undefined });
      setSales(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to load sales history');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const params = sessionFilter !== 'ALL' ? { status: sessionFilter } : undefined;
      const data: any = await api.getSessions(params);
      setSessions(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to load cash sessions');
    } finally {
      setLoadingSessions(false);
    }
  };

  const fetchPayments = async () => {
    setLoadingPayments(true);
    try {
      const params = paymentMethodFilter !== 'ALL' ? { payment_method: paymentMethodFilter } : undefined;
      const data: any = await api.getPaymentsLedger(params);
      const list = Array.isArray(data) ? data : [];
      setPaymentsLedger(list);
      
      // Expand all groups by default
      const exp: Record<string, boolean> = {};
      list.forEach((g: any) => { exp[g.payment_method] = true; });
      setExpandedGroups(exp);
    } catch (e) {
      toast.error('Failed to load payments ledger');
    } finally {
      setLoadingPayments(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'sales') {
      fetchSales();
    }
  };

  const openSaleDetails = async (sale: any) => {
    setSelectedSale(sale);
    setDetailsOpen(true);
    try {
      const fullSale = await api.getSaleById(sale.id);
      setSelectedSale(fullSale);
    } catch (e) {
      console.error('Failed to load full sale details', e);
    }
  };

  const openSessionDetails = async (session: any) => {
    setSelectedSession(session);
    setSessionDetailsOpen(true);
    setLoadingSessionSummary(true);
    try {
      const summary = await api.getSessionSummary(session.id);
      setSessionSummary(summary);
    } catch (e) {
      console.error('Failed to fetch session summary', e);
      toast.error('Failed to fetch shift details');
    } finally {
      setLoadingSessionSummary(false);
    }
  };

  const toggleGroup = (method: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [method]: !prev[method]
    }));
  };

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-120px)] bg-background">
      {/* Header & Tabs */}
      <div className="p-6 pb-0 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('subtitle')}
            </p>
          </div>

          {/* Navigation Pill Switcher */}
          <div className="flex items-center p-1 bg-surface border border-border rounded-xl flex-wrap">
            <button
              onClick={() => setActiveTab('sales')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all",
                activeTab === 'sales'
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Receipt size={15} />
              {t('tabs.ordersPos')}
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all",
                activeTab === 'invoices'
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileText size={15} />
              {t('tabs.customerInvoices')}
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all",
                activeTab === 'sessions'
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Calculator size={15} />
              {t('tabs.sessionsShifts')}
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all",
                activeTab === 'payments'
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CreditCard size={15} />
              {t('tabs.paymentsLedger')}
            </button>
          </div>
        </div>

        {/* Tab-Specific Filters Bar */}
        {activeTab === 'sales' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72">
              <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder={t('filters.searchPlaceholder')} 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 text-foreground"
              />
            </form>

            <div className="flex items-center p-1 bg-surface border border-border rounded-lg">
              {[
                { id: 'ALL', label: t('filters.all') },
                { id: 'COMPLETED', label: t('filters.completed') },
                { id: 'PARTIALLY_RETURNED', label: t('filters.partiallyReturned') },
                { id: 'RETURNED', label: t('filters.returned') }
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  className={cn(
                    "px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors",
                    statusFilter === st.id ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        ) : activeTab === 'invoices' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder={t('filters.searchInvoices')} 
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchInvoices()}
                  className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 text-foreground"
                />
              </div>
              <button
                onClick={fetchInvoices}
                className="p-2 border border-border bg-surface hover:bg-background rounded-lg text-foreground/70"
                title="Refresh invoices"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center p-1 bg-surface border border-border rounded-lg">
                {[
                  { id: 'ALL', label: t('filters.allInvoices') },
                  { id: 'DRAFT', label: t('filters.draft') },
                  { id: 'POSTED', label: t('filters.posted') },
                  { id: 'PAID', label: t('filters.paid') },
                  { id: 'CANCELLED', label: t('filters.cancelled') },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setInvoiceStatusFilter(st.id)}
                    className={cn(
                      "px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors",
                      invoiceStatusFilter === st.id ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  setSelectedInvoiceId(null);
                  setInvoiceDetailOpen(true);
                }}
                className="px-3.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus size={15} />
                <span>{t('table.newInvoice')}</span>
              </button>

              <button
                onClick={() => setInvoiceSettingsOpen(true)}
                className="p-2 border border-border bg-surface hover:bg-background rounded-lg text-foreground/70 hover:text-foreground transition-colors"
                title="Customize Pharmacy Invoice Branding"
              >
                <Settings size={16} />
              </button>
            </div>
          </div>
        ) : activeTab === 'sessions' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <span className="text-xs sm:text-sm text-muted-foreground font-medium">
              {t('filters.filterShiftsDesc')}
            </span>
            <div className="flex items-center p-1 bg-surface border border-border rounded-lg">
              <button
                onClick={() => setSessionFilter('ALL')}
                className={cn("px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors", sessionFilter === 'ALL' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
              >
                {t('filters.allShifts')}
              </button>
              <button
                onClick={() => setSessionFilter('OPEN')}
                className={cn("px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors", sessionFilter === 'OPEN' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
              >
                {t('filters.inProgress')}
              </button>
              <button
                onClick={() => setSessionFilter('CLOSED')}
                className={cn("px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors", sessionFilter === 'CLOSED' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
              >
                {t('filters.closedPosted')}
              </button>
            </div>
          </div>
        ) : (
          /* Payments Ledger Filter Bar */
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder={t('filters.searchPayments')} 
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                className="w-full pl-9 rtl:pl-4 rtl:pr-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 text-foreground"
              />
            </div>

            <div className="flex items-center flex-wrap gap-1 p-1 bg-surface border border-border rounded-lg">
              {[
                { id: 'ALL', label: t('filters.allMethods') },
                { id: 'CASH', label: t('paymentMethods.CASH') },
                { id: 'BANKAK', label: t('paymentMethods.BANKAK') },
                { id: 'FAWRY', label: t('paymentMethods.FAWRY') },
                { id: 'OCASH', label: t('paymentMethods.OCASH') },
                { id: 'AMIN', label: t('paymentMethods.AMIN') },
              ].map(pm => (
                <button
                  key={pm.id}
                  onClick={() => setPaymentMethodFilter(pm.id)}
                  className={cn(
                    "px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition-colors",
                    paymentMethodFilter === pm.id ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Table Area */}
      <div className="p-6 flex-1">
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-sm h-full flex flex-col">
          
          {/* TAB 1: ORDERS & POS (Odoo /odoo/pos-orders parity) */}
          {activeTab === 'sales' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-sm whitespace-nowrap">
                <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold">{t('table.orderInvoiceRef')}</th>
                    <th className="px-6 py-4 font-semibold hidden md:table-cell">{t('table.date')}</th>
                    <th className="px-6 py-4 font-semibold">{t('table.customer')}</th>
                    <th className="px-6 py-4 font-semibold text-center hidden md:table-cell">{t('table.items')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('table.total')}</th>
                    <th className="px-6 py-4 font-semibold text-center hidden md:table-cell">{t('table.payment')}</th>
                    <th className="px-6 py-4 font-semibold text-center">{t('table.status')}</th>
                    <th className="px-6 py-4 font-semibold text-center">{t('table.invoiceStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">{t('table.loadingSales')}</td></tr>
                  ) : sales.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                      <Receipt className="h-10 w-10 mb-3 opacity-20" />
                      {t('table.noSalesFound')}
                    </td></tr>
                  ) : (
                    sales.map(sale => (
                      <tr 
                        key={sale.id} 
                        onClick={() => openSaleDetails(sale)}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors group"
                      >
                        <td className="px-6 py-4 font-medium text-foreground flex items-center gap-2">
                          <Receipt className="h-4 w-4 text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          {sale.invoice_number}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground hidden md:table-cell">
                          {sale.created_at ? formatDateTime(sale.created_at, locale) : '-'}
                        </td>
                        <td className="px-6 py-4 text-foreground">
                          {sale.customer?.name || <span className="text-muted-foreground italic">{t('table.walkIn')}</span>}
                        </td>
                        <td className="px-6 py-4 text-center text-muted-foreground hidden md:table-cell">
                          {sale.items?.length || 0}
                        </td>
                        <td className="px-6 py-4 text-right rtl:text-left font-bold text-foreground">
                          {formatMoney(Number(sale.total_amount), currency)}
                        </td>
                        <td className="px-6 py-4 text-center hidden md:table-cell">
                          <Badge variant="default" className="text-xs font-semibold">{getPaymentMethodLabel(sale.payment_method)}</Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {getStatusBadge(sale.status)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {sale.is_invoiced || sale.invoice_status === 'FULLY_INVOICED' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 size={12} />
                              {t('table.fullyInvoiced')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: CUSTOMER INVOICES (Odoo /odoo/customer-invoices parity) */}
          {activeTab === 'invoices' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-sm whitespace-nowrap">
                <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold">{t('table.number')}</th>
                    <th className="px-6 py-4 font-semibold">{t('table.customer')}</th>
                    <th className="px-6 py-4 font-semibold hidden md:table-cell">{t('table.invoiceDate')}</th>
                    <th className="px-6 py-4 font-semibold hidden md:table-cell">{t('table.dueDate')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('table.taxExcluded')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('table.total')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left hidden lg:table-cell">{t('table.paidAmount')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left hidden lg:table-cell">{t('table.dueAmount')}</th>
                    <th className="px-6 py-4 font-semibold text-center">{t('table.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingInvoices ? (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">{t('table.loadingInvoices')}</td></tr>
                  ) : invoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center">
                          <FileText className="h-10 w-10 mb-3 opacity-20" />
                          <span>{t('table.noInvoicesFound')}</span>
                          <button
                            onClick={() => {
                              setSelectedInvoiceId(null);
                              setInvoiceDetailOpen(true);
                            }}
                            className="mt-3 px-3.5 py-1.5 bg-brand-500 text-white rounded-lg text-xs font-semibold hover:bg-brand-600 transition-colors shadow-sm"
                          >
                            {t('table.createNewInvoice')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        onClick={() => {
                          setSelectedInvoiceId(inv.id);
                          setInvoiceDetailOpen(true);
                        }}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors group"
                      >
                        <td className="px-6 py-4 font-mono font-bold text-foreground flex items-center gap-2">
                          <FileText size={15} className="text-purple-500 opacity-60 group-hover:opacity-100" />
                          {inv.invoice_number || (
                            <span className="text-foreground/40 font-serif italic text-base">/</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-medium text-foreground">
                          {inv.customer_name || t('table.walkIn')}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground hidden md:table-cell text-xs">
                          {inv.invoice_date ? formatDate(inv.invoice_date, locale) : '-'}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground hidden md:table-cell text-xs">
                          {inv.due_date ? formatDate(inv.due_date, locale) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right rtl:text-left font-mono text-muted-foreground">
                          {formatMoney(Number(inv.subtotal || inv.total_amount), currency)}
                        </td>
                        <td className="px-6 py-4 text-right rtl:text-left font-mono font-bold text-foreground">
                          {formatMoney(Number(inv.total_amount), currency)}
                        </td>
                        <td className="px-6 py-4 text-right rtl:text-left font-mono text-emerald-600 dark:text-emerald-400 hidden lg:table-cell">
                          {formatMoney(Number(inv.amount_paid || 0), currency)}
                        </td>
                        <td className="px-6 py-4 text-right rtl:text-left font-mono font-bold hidden lg:table-cell">
                          <span className={Number(inv.amount_due) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground/40'}>
                            {formatMoney(Number(inv.amount_due || 0), currency)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {inv.status === 'PAID' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                              {t('filters.paid')}
                            </span>
                          ) : inv.status === 'POSTED' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                              {t('filters.posted')}
                            </span>
                          ) : inv.status === 'DRAFT' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                              {t('filters.draft')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30">
                              {t('filters.cancelled')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {invoices.length > 0 && (
                  <tfoot className="bg-background border-t-2 border-border font-bold text-xs">
                    <tr>
                      <td colSpan={5} className="px-6 py-3 text-right rtl:text-left uppercase tracking-wider text-muted-foreground">
                        {t('table.totalsSummary', { count: invoices.length })}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-sm text-foreground">
                        {formatMoney(
                          invoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0),
                          currency
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400 hidden lg:table-cell">
                        {formatMoney(
                          invoices.reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0),
                          currency
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-amber-600 dark:text-amber-400 hidden lg:table-cell">
                        {formatMoney(
                          invoices.reduce((sum, inv) => sum + Number(inv.amount_due || 0), 0),
                          currency
                        )}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* TAB 3: SESSIONS & SHIFTS (Odoo /odoo/pos-sessions parity) */}
          {activeTab === 'sessions' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left rtl:text-right text-sm whitespace-nowrap">
                <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold">{t('table.sessionId')}</th>
                    <th className="px-6 py-4 font-semibold">{t('table.pointOfSale')}</th>
                    <th className="px-6 py-4 font-semibold">{t('table.openedBy')}</th>
                    <th className="px-6 py-4 font-semibold hidden md:table-cell">{t('table.openingDate')}</th>
                    <th className="px-6 py-4 font-semibold hidden md:table-cell">{t('table.closingDate')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('table.startingBalance')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('table.endingBalance')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('table.theoretical')}</th>
                    <th className="px-6 py-4 font-semibold text-center">{t('table.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingSessions ? (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">{t('table.loadingShifts')}</td></tr>
                  ) : sessions.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                      <Calculator className="h-10 w-10 mb-3 opacity-20" />
                      {t('table.noSessionsFound')}
                    </td></tr>
                  ) : (
                    sessions.map(s => {
                      const variance = s.variance !== null && s.variance !== undefined ? Number(s.variance) : null;
                      const hasVariance = variance !== null;
                      const isBalanced = hasVariance && Math.abs(variance) < 0.001;

                      return (
                        <tr 
                          key={s.id} 
                          onClick={() => openSessionDetails(s)}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors group"
                        >
                          <td className="px-6 py-4 font-mono font-bold text-foreground">
                            {s.session_code || `REG/${s.id.substring(0, 5).toUpperCase()}`}
                          </td>
                          <td className="px-6 py-4 font-medium text-foreground">
                            {s.terminal_name || t('table.mainRegister')}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-pos-500 text-white flex items-center justify-center font-bold text-[10px]">
                                {(s.cashier_name || 'C')[0].toUpperCase()}
                              </div>
                              <span className="font-medium text-foreground text-xs">{s.cashier_name || t('table.cashier')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground hidden md:table-cell">
                            {s.opened_at ? formatDateTime(s.opened_at, locale) : '-'}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground hidden md:table-cell">
                            {s.closed_at ? formatDateTime(s.closed_at, locale) : (
                              <span className="text-emerald-500 font-semibold">{t('filters.inProgress')}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right rtl:text-left font-medium text-foreground">
                            {formatMoney(Number(s.opening_amount), currency)}
                          </td>
                          <td className="px-6 py-4 text-right rtl:text-left font-bold text-foreground">
                            {s.closing_amount !== null && s.closing_amount !== undefined
                              ? formatMoney(Number(s.closing_amount), currency)
                              : '-'}
                          </td>
                          <td className="px-6 py-4 text-right rtl:text-left font-medium text-foreground">
                            {s.expected_amount !== null && s.expected_amount !== undefined
                              ? formatMoney(Number(s.expected_amount), currency)
                              : '-'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {s.status === 'OPEN' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                {t('filters.inProgress')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                {t('filters.closedPosted')}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 4: PAYMENTS LEDGER (Odoo /odoo/action-431 parity) */}
          {activeTab === 'payments' && (
            <div className="overflow-x-auto p-4 space-y-4">
              {loadingPayments ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
                  <span>{t('table.loadingPayments')}</span>
                </div>
              ) : paymentsLedger.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                  <CreditCard className="h-10 w-10 mb-3 opacity-20" />
                  {t('table.noPaymentsFound')}
                </div>
              ) : (
                paymentsLedger.map((grp: any) => {
                  const isExpanded = expandedGroups[grp.payment_method] !== false;

                  return (
                    <div key={grp.payment_method} className="rounded-xl border border-border bg-background overflow-hidden shadow-sm">
                      {/* Group Header (Odoo style: ▾ Bankak (5) - 35,560,100.00 SDG) */}
                      <button
                        type="button"
                        onClick={() => toggleGroup(grp.payment_method)}
                        className="w-full flex items-center justify-between p-3.5 px-5 bg-surface/70 hover:bg-surface border-b border-border transition-colors text-left rtl:text-right"
                      >
                        <div className="flex items-center gap-2.5">
                          {isExpanded ? <ChevronDown size={18} className="text-foreground/60" /> : <ChevronRight size={18} className="text-foreground/60 rtl:rotate-180" />}
                          <span className="font-extrabold text-sm text-foreground">
                            {getPaymentMethodLabel(grp.payment_method) || grp.display_name}
                          </span>
                          <span className="text-xs text-foreground/50 font-semibold bg-background px-2 py-0.5 rounded-full border border-border">
                            {t('table.transactionCount', { count: grp.transaction_count })}
                          </span>
                        </div>
                        <span className="font-black text-sm text-pos-600 dark:text-pos-300">
                          {formatMoney(Number(grp.total_amount), currency)}
                        </span>
                      </button>

                      {/* Items Table */}
                      {isExpanded && (
                        <table className="w-full text-left rtl:text-right text-xs whitespace-nowrap">
                          <thead className="bg-background text-foreground/60 uppercase border-b border-border/80">
                            <tr>
                              <th className="px-5 py-2.5 font-semibold">{t('table.dateTime')}</th>
                              <th className="px-5 py-2.5 font-semibold">{t('table.orderInvoiceRef')}</th>
                              <th className="px-5 py-2.5 font-semibold">{t('table.employee')}</th>
                              <th className="px-5 py-2.5 font-semibold hidden md:table-cell">{t('table.referenceCode')}</th>
                              <th className="px-5 py-2.5 font-semibold text-right rtl:text-left">{t('table.amount')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {grp.payments
                              .filter((p: any) => {
                                if (!paymentSearch) return true;
                                const q = paymentSearch.toLowerCase();
                                return (
                                  p.invoice_number.toLowerCase().includes(q) ||
                                  p.employee_name.toLowerCase().includes(q) ||
                                  (p.reference && p.reference.toLowerCase().includes(q))
                                );
                              })
                              .map((p: any) => (
                                <tr key={p.id} className="hover:bg-surface/50 transition-colors">
                                  <td className="px-5 py-2.5 text-muted-foreground font-medium">
                                    {p.created_at ? formatDateTime(p.created_at, locale) : '-'}
                                  </td>
                                  <td className="px-5 py-2.5 font-bold text-foreground">
                                    <span className="text-brand-500 hover:underline cursor-pointer">
                                      {p.invoice_number}
                                    </span>
                                  </td>
                                  <td className="px-5 py-2.5 text-foreground font-medium">
                                    {p.employee_name}
                                  </td>
                                  <td className="px-5 py-2.5 text-muted-foreground font-mono hidden md:table-cell">
                                    {p.reference || '—'}
                                  </td>
                                  <td className="px-5 py-2.5 text-right rtl:text-left font-black text-foreground">
                                    {formatMoney(Number(p.amount), currency)}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sale Details Slide-over */}
      <Dialog.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l border-border shadow-2xl z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300">
            {selectedSale && (
              <>
                <div className="flex-none flex items-center justify-between p-6 border-b border-border bg-background/50">
                  <div>
                    <Dialog.Title className="text-xl font-bold text-foreground flex items-center gap-2">
                      {selectedSale.invoice_number}
                      {selectedSale.status === 'RETURNED' && <Badge variant="danger">{t('details.fullyRefunded')}</Badge>}
                      {selectedSale.status === 'PARTIALLY_RETURNED' && <Badge variant="warning">{t('filters.partiallyReturned')}</Badge>}
                      {selectedSale.status === 'COMPLETED' && <Badge variant="success">{t('filters.completed')}</Badge>}
                    </Dialog.Title>
                    <Dialog.Description className="text-xs text-muted-foreground mt-1">
                      {selectedSale.created_at ? formatDateTime(selectedSale.created_at, locale) : ''}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Summary Card */}
                  <div className="bg-background rounded-xl p-4 border border-border space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{t('details.customer')}</span>
                      <span className="font-semibold text-foreground">{selectedSale.customer?.name || t('table.walkIn')}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{t('details.paymentTender')}</span>
                      <span className="font-semibold text-foreground uppercase">{getPaymentMethodLabel(selectedSale.payment_method)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm pt-2 border-t border-border">
                      <span className="font-bold text-foreground">{t('details.totalAmount')}</span>
                      <span className="text-lg font-black text-brand-500">{formatMoney(Number(selectedSale.total_amount), currency)}</span>
                    </div>
                  </div>

                  {/* Multi-tender Payment breakdown if split */}
                  {selectedSale.payments && selectedSale.payments.length > 0 && (
                    <div className="rounded-xl border border-border bg-background p-4 space-y-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                        {t('details.paymentsReceived')}
                      </span>
                      <div className="space-y-1.5 text-xs">
                        {selectedSale.payments.map((p: any) => (
                          <div key={p.id} className="flex justify-between items-center py-1 border-b border-border/40 last:border-b-0">
                            <span className="font-semibold text-foreground">{getPaymentMethodLabel(p.payment_method)}</span>
                            <span className="font-bold text-foreground">{formatMoney(Number(p.amount), currency)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Items List */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{t('details.itemsSold')}</h3>
                    <div className="space-y-2">
                      {selectedSale.items?.map((item: any) => (
                        <div key={item.id} className="p-3 rounded-xl bg-background border border-border flex items-center justify-between text-xs">
                          <div>
                            <p className="font-semibold text-foreground">{item.medicine_name || item.name || 'Medicine'}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {Number(item.quantity)} × {formatMoney(Number(item.unit_price), currency)}
                            </p>
                          </div>
                          <span className="font-bold text-foreground">{formatMoney(Number(item.line_total), currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-border bg-background/50 flex gap-2">
                  <button
                    onClick={() => {
                      setA4InvoiceData(selectedSale);
                      setA4ModalOpen(true);
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    <FileText size={14} />
                    <span>{t('details.printA4')}</span>
                  </button>
                  {!selectedSale.is_invoiced && (
                    <button
                      onClick={async () => {
                        try {
                          const inv: any = await api.generateInvoiceFromPosSale(selectedSale.id);
                          toast.success(`Generated official invoice ${inv.invoice_number}!`);
                          setA4InvoiceData(inv);
                          setA4ModalOpen(true);
                          fetchSales();
                        } catch (err: any) {
                          toast.error(err.message || 'Failed to generate invoice');
                        }
                      }}
                      className="py-2 px-3 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      title="Generate official tax invoice"
                    >
                      <Plus size={14} />
                      <span>{t('details.postInvoice')}</span>
                    </button>
                  )}
                  <button
                    onClick={() => setReturnModalOpen(true)}
                    disabled={selectedSale.status === 'RETURNED'}
                    className="py-2 px-3 rounded-xl border border-border bg-surface hover:bg-background text-foreground text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 transition-colors"
                  >
                    <RotateCcw size={14} />
                    <span>{t('details.refund')}</span>
                  </button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Session Details Slide-over (Enhanced with Multi-Tender Breakdown & Cashier) */}
      <Dialog.Root open={sessionDetailsOpen} onOpenChange={setSessionDetailsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-surface border-l border-border shadow-2xl z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300">
            {selectedSession && (
              <>
                <div className="flex-none flex items-center justify-between p-6 border-b border-border bg-background/50">
                  <div>
                    <Dialog.Title className="text-xl font-bold text-foreground flex items-center gap-2">
                      <span>{selectedSession.session_code || selectedSession.terminal_name}</span>
                      {selectedSession.status === 'OPEN' ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-500/20">{t('filters.inProgress')}</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface text-foreground/70 font-semibold border border-border">{t('filters.closedPosted')}</span>
                      )}
                    </Dialog.Title>
                    <Dialog.Description className="text-xs text-muted-foreground mt-1">
                      {t('table.cashier')}: <span className="font-semibold text-foreground">{selectedSession.cashier_name || t('table.cashier')}</span> • {t('table.openingDate')}: {selectedSession.opened_at ? formatDateTime(selectedSession.opened_at, locale) : '-'}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {loadingSessionSummary ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
                      <span>Loading shift calculation...</span>
                    </div>
                  ) : (
                    <>
                      {/* Financial Reconciliation Breakdown */}
                      <div className="bg-background rounded-xl p-4 border border-border space-y-2.5">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                          Drawer Reconciliation (Cash)
                        </span>

                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between items-center text-foreground/80">
                            <span>Opening Float</span>
                            <span className="font-semibold">{formatMoney(Number(sessionSummary?.opening_amount || selectedSession.opening_amount), currency)}</span>
                          </div>

                          <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                            <span className="flex items-center gap-1"><ArrowDownCircle size={14} /> Cash Sales</span>
                            <span className="font-semibold">+{formatMoney(Number(sessionSummary?.total_cash_sales || 0), currency)}</span>
                          </div>

                          {Boolean(Number(sessionSummary?.total_cash_refunds || 0)) && (
                            <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                              <span className="flex items-center gap-1"><ArrowUpCircle size={14} /> Cash Refunds</span>
                              <span className="font-semibold">-{formatMoney(Number(sessionSummary?.total_cash_refunds), currency)}</span>
                            </div>
                          )}

                          {Boolean(Number(sessionSummary?.total_cash_in || 0)) && (
                            <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                              <span className="flex items-center gap-1"><ArrowDownCircle size={14} /> Cash In (Deposits)</span>
                              <span className="font-semibold">+{formatMoney(Number(sessionSummary?.total_cash_in), currency)}</span>
                            </div>
                          )}

                          {Boolean(Number(sessionSummary?.total_cash_out || 0)) && (
                            <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                              <span className="flex items-center gap-1"><ArrowUpCircle size={14} /> Cash Out (Expenses)</span>
                              <span className="font-semibold">-{formatMoney(Number(sessionSummary?.total_cash_out), currency)}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-border flex justify-between items-center text-sm font-bold">
                          <span>Expected Cash in Drawer</span>
                          <span className="text-brand-500 font-extrabold">
                            {formatMoney(Number(sessionSummary?.expected_amount || 0), currency)}
                          </span>
                        </div>

                        {selectedSession.closing_amount !== null && (
                          <div className="flex justify-between items-center text-sm font-bold pt-1">
                            <span>Actual Counted Cash</span>
                            <span>{formatMoney(Number(selectedSession.closing_amount), currency)}</span>
                          </div>
                        )}

                        {selectedSession.variance !== null && (
                          <div className={cn(
                            "p-2.5 rounded-lg border flex items-center justify-between text-xs font-bold mt-2",
                            Math.abs(Number(selectedSession.variance)) < 0.001
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                              : Number(selectedSession.variance) > 0
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                              : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                          )}>
                            <span>
                              {Math.abs(Number(selectedSession.variance)) < 0.001
                                ? 'Balanced (Zero Variance)'
                                : Number(selectedSession.variance) > 0
                                ? 'Cash Surplus (Over)'
                                : 'Cash Shortage (Under)'}
                            </span>
                            <span className="text-sm font-extrabold">
                              {Number(selectedSession.variance) > 0 ? '+' : ''}
                              {formatMoney(Number(selectedSession.variance), currency)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Multi-Tender Payments Breakdown (Matching Odoo) */}
                      {sessionSummary?.payments_breakdown && sessionSummary.payments_breakdown.length > 0 && (
                        <div className="rounded-xl border border-border bg-background p-4 space-y-2.5">
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                            All Shift Payments by Tender
                          </span>
                          <div className="space-y-1.5 text-xs">
                            {sessionSummary.payments_breakdown.map((pm: any) => (
                              <div key={pm.payment_method} className="flex justify-between items-center py-1 border-b border-border/40 last:border-b-0">
                                <div>
                                  <span className="font-bold text-foreground">{pm.display_name}</span>
                                  <span className="text-muted-foreground ml-1">({pm.orders_count} orders)</span>
                                </div>
                                <span className="font-extrabold text-foreground">{formatMoney(Number(pm.expected_amount), currency)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Opening Handover Note */}
                      {selectedSession.opening_notes && (
                        <div className="p-3 rounded-xl bg-background border border-border">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                            Opening Handover Note
                          </span>
                          <p className="text-xs text-foreground italic">"{selectedSession.opening_notes}"</p>
                        </div>
                      )}

                      {/* Closing Note */}
                      {selectedSession.notes && (
                        <div className="p-3 rounded-xl bg-background border border-border">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                            Closing Reconciliation Note
                          </span>
                          <p className="text-xs text-foreground italic">"{selectedSession.notes}"</p>
                        </div>
                      )}

                      {/* Cash Movements Timeline */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                          Cash Movements ({sessionSummary?.movements?.length || 0})
                        </h4>
                        {!sessionSummary?.movements || sessionSummary.movements.length === 0 ? (
                          <div className="p-3 rounded-xl bg-background border border-border text-center text-xs text-muted-foreground">
                            No cash-in or cash-out recorded for this shift.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {sessionSummary.movements.map((m: any) => (
                              <div key={m.id} className="p-2.5 rounded-xl bg-background border border-border flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  {m.movement_type === 'CASH_IN' ? (
                                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                                      <ArrowDownCircle size={14} />
                                    </div>
                                  ) : (
                                    <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                                      <ArrowUpCircle size={14} />
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-semibold text-foreground">{m.reason}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {m.created_at ? format(new Date(m.created_at), 'hh:mm a') : ''}
                                    </p>
                                  </div>
                                </div>
                                <span className={cn(
                                  "font-bold text-xs",
                                  m.movement_type === 'CASH_IN' ? "text-emerald-600" : "text-rose-600"
                                )}>
                                  {m.movement_type === 'CASH_IN' ? '+' : '-'}{formatMoney(Number(m.amount), currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Sales Return Modal */}
      <ReturnModal
        isOpen={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        sale={selectedSale}
        currency={currency}
        onReturnSuccess={(updatedSale) => {
          setSelectedSale(updatedSale);
          fetchSales();
        }}
      />

      {/* Odoo Parity Customer Invoice Modals */}
      <InvoiceDetailModal
        open={invoiceDetailOpen}
        onClose={() => setInvoiceDetailOpen(false)}
        invoiceId={selectedInvoiceId}
        onRefresh={() => {
          fetchInvoices();
          fetchSales();
        }}
      />

      <InvoiceSettingsModal
        open={invoiceSettingsOpen}
        onClose={() => setInvoiceSettingsOpen(false)}
        onSaved={fetchInvoices}
      />

      <A4InvoiceModal
        open={a4ModalOpen}
        onClose={() => {
          setA4ModalOpen(false);
          setA4InvoiceData(null);
        }}
        invoiceData={a4InvoiceData}
      />
    </div>
  );
}
