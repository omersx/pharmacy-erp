'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import { format } from 'date-fns';
import { 
  Search, Calendar, Filter, Receipt, ArrowLeftRight, 
  ChevronRight, AlertCircle, RefreshCw, X, Calculator,
  TrendingUp, TrendingDown, CheckCircle2, ArrowDownCircle,
  ArrowUpCircle, DollarSign, Clock, ShieldAlert, CreditCard,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';
import { ReturnModal } from './ReturnModal';

export default function SalesHistoryPage() {
  const [activeTab, setActiveTab] = useState<'sales' | 'sessions'>('sales');
  
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

  // Cash Sessions State
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [sessionSummary, setSessionSummary] = useState<any | null>(null);
  const [loadingSessionSummary, setLoadingSessionSummary] = useState(false);
  const [sessionDetailsOpen, setSessionDetailsOpen] = useState(false);

  useEffect(() => {
    if (activeTab === 'sales') {
      fetchSales();
    } else {
      fetchSessions();
    }
  }, [activeTab, statusFilter, sessionFilter]);

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

  const handleProcessReturn = async () => {
    if (!selectedSale) return;
    
    if (confirm(`Are you sure you want to refund Invoice ${selectedSale.invoice_number}? This action cannot be undone.`)) {
      setIsReturning(true);
      try {
        const result = await api.returnSale(selectedSale.id);
        toast.success(`Invoice ${selectedSale.invoice_number} has been refunded.`);
        setSelectedSale(result);
        fetchSales();
      } catch (error) {
        toast.error('Failed to process return. Ensure it is not already returned.');
      } finally {
        setIsReturning(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-120px)] bg-background">
      {/* Header & Tabs */}
      <div className="p-6 pb-0 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Sales & Cash Register</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Audit receipts, track cash sessions, and inspect register variances
            </p>
          </div>

          {/* Navigation Pill Switcher */}
          <div className="flex items-center p-1 bg-surface border border-border rounded-xl">
            <button
              onClick={() => setActiveTab('sales')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all",
                activeTab === 'sales'
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Receipt size={16} />
              Invoices & Receipts
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all",
                activeTab === 'sessions'
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Calculator size={16} />
              Cash Shifts & Registers
            </button>
          </div>
        </div>

        {/* Tab-Specific Filters Bar */}
        {activeTab === 'sales' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {/* Search */}
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search invoice number..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 text-foreground"
              />
            </form>

            {/* Status Filter */}
            <div className="flex items-center p-1 bg-surface border border-border rounded-lg">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", statusFilter === 'ALL' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('COMPLETED')}
                className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", statusFilter === 'COMPLETED' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
              >
                Completed
              </button>
              <button
                onClick={() => setStatusFilter('PARTIALLY_RETURNED')}
                className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", statusFilter === 'PARTIALLY_RETURNED' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
              >
                Partially Returned
              </button>
              <button
                onClick={() => setStatusFilter('RETURNED')}
                className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", statusFilter === 'RETURNED' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
              >
                Fully Returned
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <span className="text-sm text-muted-foreground font-medium">
              Filter cash shifts by register status
            </span>
            <div className="flex items-center p-1 bg-surface border border-border rounded-lg">
              <button
                onClick={() => setSessionFilter('ALL')}
                className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", sessionFilter === 'ALL' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
              >
                All Shifts
              </button>
              <button
                onClick={() => setSessionFilter('OPEN')}
                className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", sessionFilter === 'OPEN' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
              >
                Active / Open
              </button>
              <button
                onClick={() => setSessionFilter('CLOSED')}
                className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", sessionFilter === 'CLOSED' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
              >
                Closed & Reconciled
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Table Area */}
      <div className="p-6 flex-1">
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-sm h-full flex flex-col">
          {activeTab === 'sales' ? (
            /* ===== SALES TABLE ===== */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Invoice</th>
                    <th className="px-6 py-4 font-semibold hidden md:table-cell">Date</th>
                    <th className="px-6 py-4 font-semibold">Customer</th>
                    <th className="px-6 py-4 font-semibold text-center hidden md:table-cell">Items</th>
                    <th className="px-6 py-4 font-semibold text-right">Total</th>
                    <th className="px-6 py-4 font-semibold text-center hidden md:table-cell">Payment</th>
                    <th className="px-6 py-4 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">Loading sales...</td></tr>
                  ) : sales.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                      <Receipt className="h-10 w-10 mb-3 opacity-20" />
                      No sales found for the selected filters.
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
                          {sale.created_at ? format(new Date(sale.created_at), 'MMM dd, yyyy - hh:mm a') : '-'}
                        </td>
                        <td className="px-6 py-4 text-foreground">
                          {sale.customer?.name || <span className="text-muted-foreground italic">Walk-in</span>}
                        </td>
                        <td className="px-6 py-4 text-center text-muted-foreground hidden md:table-cell">
                          {sale.items?.length || 0}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-foreground">
                          {currency} {Number(sale.total_amount).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-center hidden md:table-cell">
                          <Badge variant="default" className="uppercase text-xs">{sale.payment_method}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {sale.status === 'COMPLETED' ? (
                            <Badge variant="success">Completed</Badge>
                          ) : sale.status === 'PARTIALLY_RETURNED' ? (
                            <Badge variant="warning">Partially Returned</Badge>
                          ) : (
                            <Badge variant="danger">Fully Returned</Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* ===== CASH SESSIONS TABLE ===== */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Terminal</th>
                    <th className="px-6 py-4 font-semibold hidden md:table-cell">Opened</th>
                    <th className="px-6 py-4 font-semibold hidden md:table-cell">Closed</th>
                    <th className="px-6 py-4 font-semibold text-right">Opening Float</th>
                    <th className="px-6 py-4 font-semibold text-right">Expected</th>
                    <th className="px-6 py-4 font-semibold text-right">Closing Count</th>
                    <th className="px-6 py-4 font-semibold text-right">Variance</th>
                    <th className="px-6 py-4 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingSessions ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">Loading cash shifts...</td></tr>
                  ) : sessions.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground flex flex-col items-center justify-center">
                      <Calculator className="h-10 w-10 mb-3 opacity-20" />
                      No cash register sessions found.
                    </td></tr>
                  ) : (
                    sessions.map(s => {
                      const variance = s.variance !== null && s.variance !== undefined ? Number(s.variance) : null;
                      const hasVariance = variance !== null;
                      const isBalanced = hasVariance && Math.abs(variance) < 0.001;
                      const isOver = hasVariance && variance > 0.001;
                      const isShort = hasVariance && variance < -0.001;

                      return (
                        <tr 
                          key={s.id} 
                          onClick={() => openSessionDetails(s)}
                          className="hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors group"
                        >
                          <td className="px-6 py-4 font-medium text-foreground flex items-center gap-2">
                            <Calculator className="h-4 w-4 text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            {s.terminal_name || 'Main Register'}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground hidden md:table-cell">
                            {s.opened_at ? format(new Date(s.opened_at), 'MMM dd, yyyy - hh:mm a') : '-'}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground hidden md:table-cell">
                            {s.closed_at ? format(new Date(s.closed_at), 'MMM dd, yyyy - hh:mm a') : (
                              <span className="text-emerald-500 font-medium">In Progress</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-foreground">
                            {currency} {Number(s.opening_amount).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-foreground">
                            {s.expected_amount !== null && s.expected_amount !== undefined
                              ? `${currency} ${Number(s.expected_amount).toFixed(2)}`
                              : '-'}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-foreground">
                            {s.closing_amount !== null && s.closing_amount !== undefined
                              ? `${currency} ${Number(s.closing_amount).toFixed(2)}`
                              : '-'}
                          </td>
                          <td className="px-6 py-4 text-right font-bold">
                            {hasVariance ? (
                              isBalanced ? (
                                <span className="text-emerald-600 dark:text-emerald-400">0.00</span>
                              ) : isOver ? (
                                <span className="text-emerald-600 dark:text-emerald-400">+{currency} {variance.toFixed(2)}</span>
                              ) : (
                                <span className="text-rose-600 dark:text-rose-400">-{currency} {Math.abs(variance).toFixed(2)}</span>
                              )
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {s.status === 'OPEN' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Open
                              </span>
                            ) : (
                              <Badge variant="default">Closed</Badge>
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
                      {selectedSale.status === 'RETURNED' && <Badge variant="danger">Fully Refunded</Badge>}
                      {selectedSale.status === 'PARTIALLY_RETURNED' && <Badge variant="warning">Partially Returned</Badge>}
                      {selectedSale.status === 'COMPLETED' && <Badge variant="success">Completed</Badge>}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-muted-foreground mt-1">
                      {selectedSale.created_at ? format(new Date(selectedSale.created_at), 'PPP at p') : ''}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-background rounded-lg p-4 border border-border">
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Customer</p>
                      <p className="text-sm font-semibold text-foreground truncate">
                        {selectedSale.customer?.name || 'Walk-in Customer'}
                      </p>
                    </div>
                    <div className="bg-background rounded-lg p-4 border border-border">
                      <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Payment</p>
                      <p className="text-sm font-semibold text-foreground uppercase">
                        {selectedSale.payment_method}
                      </p>
                    </div>
                  </div>

                  {/* Items List */}
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Receipt Items</h3>
                    <div className="space-y-3">
                      {selectedSale.items?.map((item: any, i: number) => {
                        const originalQty = Number(item.quantity) || 0;
                        const returnedQty = Number(item.quantity_returned) || 0;
                        const remainingQty = Math.max(0, originalQty - returnedQty);

                        return (
                          <div key={i} className="flex justify-between items-start py-2.5 border-b border-border/50 last:border-0">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {item.medicine_name || item.medicine?.name_en || `Medicine #${item.medicine_id.substring(0,8)}`}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                {item.batch_number && (
                                  <span className="font-mono bg-background px-1.5 py-0.5 rounded border border-border">
                                    {item.batch_number}
                                  </span>
                                )}
                                <span>{originalQty} sold @ {currency} {Number(item.unit_price).toFixed(2)}</span>
                                {returnedQty > 0 && (
                                  <span className="text-amber-500 font-semibold">
                                    ({returnedQty} returned)
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-foreground">{currency} {Number(item.line_total).toFixed(2)}</p>
                              {returnedQty > 0 && remainingQty > 0 && (
                                <p className="text-[11px] text-muted-foreground">{remainingQty} remaining</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      
                      {!selectedSale.items?.length && (
                        <div className="py-4 text-center text-sm text-muted-foreground">Loading items...</div>
                      )}
                    </div>
                  </div>

                  {/* Returns History Section if any returns exist */}
                  {selectedSale.returns && selectedSale.returns.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                        <RotateCcw size={15} />
                        Return Audit History ({selectedSale.returns.length})
                      </div>

                      <div className="space-y-3">
                        {selectedSale.returns.map((ret: any) => (
                          <div key={ret.id} className="rounded-xl bg-background border border-border p-3.5 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 font-mono font-bold text-foreground">
                                <span className="text-brand-500">{ret.return_number}</span>
                                <Badge variant="outline" className="uppercase text-[10px]">{ret.refund_method}</Badge>
                              </div>
                              <span className="font-bold text-rose-500 text-sm">
                                -{currency} {Number(ret.total_refund).toFixed(2)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-muted-foreground">
                              <span>{ret.created_at ? format(new Date(ret.created_at), 'MMM dd, yyyy - hh:mm a') : '-'}</span>
                              {ret.reason && <span className="italic truncate max-w-[180px]">{ret.reason}</span>}
                            </div>

                            {/* Returned item pills */}
                            {ret.items && ret.items.length > 0 && (
                              <div className="pt-2 border-t border-border/50 space-y-1.5">
                                {ret.items.map((rit: any) => (
                                  <div key={rit.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 truncate max-w-[200px]">
                                      <span className="font-medium text-foreground">{rit.medicine_name || 'Item'}:</span>
                                      <span className="text-muted-foreground">{rit.quantity} returned</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className={cn(
                                        "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                                        rit.condition === 'GOOD' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                      )}>
                                        {rit.condition}
                                      </span>
                                      <span className={cn(
                                        "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                                        rit.disposition === 'RESTOCK' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" : "bg-purple-500/10 text-purple-500 border-purple-500/20"
                                      )}>
                                        {rit.disposition}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="bg-background rounded-lg p-5 border border-border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">Original Total</span>
                      <span className="text-sm text-foreground">{currency} {Number(selectedSale.total_amount).toFixed(2)}</span>
                    </div>
                    {Boolean(selectedSale.returns && selectedSale.returns.length > 0) && (
                      <div className="flex justify-between items-center mb-2 text-rose-500">
                        <span className="text-sm font-medium">Total Refunded</span>
                        <span className="text-sm font-semibold">
                          -{currency} {selectedSale.returns.reduce((sum: number, r: any) => sum + Number(r.total_refund || 0), 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center py-2 border-t border-border mt-2">
                      <span className="text-lg font-bold text-foreground">Net Retained</span>
                      <span className="text-lg font-black text-brand-400">
                        {currency} {(Number(selectedSale.total_amount) - (selectedSale.returns?.reduce((sum: number, r: any) => sum + Number(r.total_refund || 0), 0) || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="flex-none p-6 border-t border-border bg-background/50">
                  {selectedSale.status !== 'RETURNED' ? (
                    <button
                      onClick={() => setReturnModalOpen(true)}
                      className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-medium py-3 rounded-xl transition-all shadow-md shadow-brand-500/20"
                    >
                      <RotateCcw className="h-5 w-5" /> Process Return / Refund
                    </button>
                  ) : (
                    <div className="w-full flex items-center justify-center gap-2 bg-gray-200 dark:bg-gray-800 text-muted-foreground font-medium py-3 rounded-xl">
                      <AlertCircle className="h-5 w-5" /> Fully Refunded
                    </div>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Cash Session Details Slide-over */}
      <Dialog.Root open={sessionDetailsOpen} onOpenChange={setSessionDetailsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-surface border-l border-border shadow-2xl z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300">
            {selectedSession && (
              <>
                <div className="flex-none flex items-center justify-between p-6 border-b border-border bg-background/50">
                  <div>
                    <Dialog.Title className="text-xl font-bold text-foreground flex items-center gap-2">
                      <Calculator className="w-5 h-5 text-brand-500" />
                      {selectedSession.terminal_name || 'Register Shift'}
                      {selectedSession.status === 'OPEN' ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-500/20">Open</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-surface text-foreground/70 font-semibold border border-border">Closed</span>
                      )}
                    </Dialog.Title>
                    <Dialog.Description className="text-xs text-muted-foreground mt-1">
                      Opened: {selectedSession.opened_at ? format(new Date(selectedSession.opened_at), 'PPP p') : '-'}
                      {selectedSession.closed_at ? ` • Closed: ${format(new Date(selectedSession.closed_at), 'PPP p')}` : ''}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                          Drawer Reconciliation
                        </span>

                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between items-center text-foreground/80">
                            <span>Opening Float</span>
                            <span className="font-semibold">{currency} {Number(sessionSummary?.opening_amount || selectedSession.opening_amount).toFixed(2)}</span>
                          </div>

                          <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                            <span className="flex items-center gap-1"><ArrowDownCircle size={14} /> Cash Sales</span>
                            <span className="font-semibold">+{currency} {Number(sessionSummary?.total_cash_sales || 0).toFixed(2)}</span>
                          </div>

                          {Boolean(Number(sessionSummary?.total_cash_refunds || 0)) && (
                            <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                              <span className="flex items-center gap-1"><ArrowUpCircle size={14} /> Cash Refunds</span>
                              <span className="font-semibold">-{currency} {Number(sessionSummary?.total_cash_refunds).toFixed(2)}</span>
                            </div>
                          )}

                          {Boolean(Number(sessionSummary?.total_cash_in || 0)) && (
                            <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                              <span className="flex items-center gap-1"><ArrowDownCircle size={14} /> Cash In (Deposits)</span>
                              <span className="font-semibold">+{currency} {Number(sessionSummary?.total_cash_in).toFixed(2)}</span>
                            </div>
                          )}

                          {Boolean(Number(sessionSummary?.total_cash_out || 0)) && (
                            <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                              <span className="flex items-center gap-1"><ArrowUpCircle size={14} /> Cash Out (Expenses)</span>
                              <span className="font-semibold">-{currency} {Number(sessionSummary?.total_cash_out).toFixed(2)}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-border flex justify-between items-center text-sm font-bold">
                          <span>Expected Cash in Drawer</span>
                          <span className="text-brand-500 font-extrabold">
                            {currency} {Number(sessionSummary?.expected_amount || 0).toFixed(2)}
                          </span>
                        </div>

                        {selectedSession.closing_amount !== null && (
                          <div className="flex justify-between items-center text-sm font-bold pt-1">
                            <span>Actual Counted Cash</span>
                            <span>{currency} {Number(selectedSession.closing_amount).toFixed(2)}</span>
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
                              {currency} {Number(selectedSession.variance).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Digital & Non-cash Sales */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-background border border-border">
                          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                            <CreditCard size={14} className="text-blue-500" />
                            <span>Card & Digital</span>
                          </div>
                          <span className="text-sm font-bold text-foreground">
                            {currency} {Number(sessionSummary?.total_card_sales || 0).toFixed(2)}
                          </span>
                        </div>

                        <div className="p-3 rounded-xl bg-background border border-border">
                          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                            <Receipt size={14} className="text-purple-500" />
                            <span>Total Receipts</span>
                          </div>
                          <span className="text-sm font-bold text-foreground">
                            {sessionSummary?.total_sales_count || 0} sales
                          </span>
                        </div>
                      </div>

                      {/* Cash Movements Timeline */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                          Cash Movements During Shift ({sessionSummary?.movements?.length || 0})
                        </h4>
                        {!sessionSummary?.movements || sessionSummary.movements.length === 0 ? (
                          <div className="p-4 rounded-xl bg-background border border-border text-center text-xs text-muted-foreground">
                            No manual cash-in or cash-out recorded for this shift.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {sessionSummary.movements.map((m: any) => (
                              <div key={m.id} className="p-3 rounded-xl bg-background border border-border flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2.5">
                                  {m.movement_type === 'CASH_IN' ? (
                                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                                      <ArrowDownCircle size={15} />
                                    </div>
                                  ) : (
                                    <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                                      <ArrowUpCircle size={15} />
                                    </div>
                                  )}
                                  <div>
                                    <p className="font-semibold text-foreground">{m.reason}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {m.created_at ? format(new Date(m.created_at), 'hh:mm a') : ''} • {m.movement_type === 'CASH_IN' ? 'Deposit' : 'Expense'}
                                    </p>
                                  </div>
                                </div>
                                <span className={cn(
                                  "font-bold text-sm",
                                  m.movement_type === 'CASH_IN' ? "text-emerald-600" : "text-rose-600"
                                )}>
                                  {m.movement_type === 'CASH_IN' ? '+' : '-'}{currency} {Number(m.amount).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Cashier Notes */}
                      {selectedSession.notes && (
                        <div className="p-3 rounded-xl bg-background border border-border">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                            Shift Notes & Variance Reason
                          </span>
                          <p className="text-xs text-foreground italic">
                            "{selectedSession.notes}"
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Sales Return & Condition Inspection Modal */}
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
    </div>
  );
}