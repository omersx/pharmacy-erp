'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import { format } from 'date-fns';
import { 
  Search, Calendar, Filter, Receipt, ArrowLeftRight, 
  ChevronRight, AlertCircle, RefreshCw, X 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';

export default function SalesHistoryPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { currency } = useAppStore();
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  // Details Slide-over
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isReturning, setIsReturning] = useState(false);

  useEffect(() => {
    fetchSales();
  }, [statusFilter]);

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSales();
  };

  const openSaleDetails = async (sale: any) => {
    setSelectedSale(sale);
    setDetailsOpen(true);
    // Fetch full details if items are missing
    if (!sale.items || sale.items.length === 0) {
      try {
        const fullSale = await api.getSaleById(sale.id);
        setSelectedSale(fullSale);
      } catch (e) {
        toast.error('Failed to load sale details');
      }
    }
  };

  const handleProcessReturn = async () => {
    if (!selectedSale) return;
    
    if (confirm(`Are you sure you want to refund Invoice ${selectedSale.invoice_number}? This action cannot be undone.`)) {
      setIsReturning(true);
      try {
        const result = await api.returnSale(selectedSale.id);
        toast.success(`Invoice ${selectedSale.invoice_number} has been refunded.`);
        setSelectedSale(result); // Update local details
        fetchSales(); // Refresh table
      } catch (error) {
        toast.error('Failed to process return. Ensure it is not already returned.');
      } finally {
        setIsReturning(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-120px)] bg-background">
      {/* Header & Filters */}
      <div className="p-6 pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sales History</h1>
          <p className="text-sm text-muted-foreground mt-1">View all past transactions and process refunds</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search invoice..." 
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
              onClick={() => setStatusFilter('RETURNED')}
              className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", statusFilter === 'RETURNED' ? "bg-brand-500 text-white" : "text-muted-foreground hover:text-foreground")}
            >
              Returned
            </button>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="p-6 flex-1">
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-sm h-full flex flex-col">
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
                      className="hover:bg-gray-800/30 cursor-pointer transition-colors group"
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
                        ) : (
                          <Badge variant="danger">Returned</Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
                      {selectedSale.status === 'RETURNED' && <Badge variant="danger">Refunded</Badge>}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-muted-foreground mt-1">
                      {selectedSale.created_at ? format(new Date(selectedSale.created_at), 'PPP at p') : ''}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button className="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-gray-700 transition-colors">
                      <X size={18} />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
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
                    <div className="space-y-4">
                      {selectedSale.items?.map((item: any, i: number) => (
                        <div key={i} className="flex justify-between items-start py-2 border-b border-border/50 last:border-0">
                          <div>
                            <p className="text-sm font-medium text-foreground">Medicine ID: {item.medicine_id.substring(0,8)}</p>
                            <p className="text-xs text-muted-foreground">{item.quantity} x {currency} {Number(item.unit_price).toFixed(2)}</p>
                          </div>
                          <p className="text-sm font-bold text-foreground">{currency} {Number(item.line_total).toFixed(2)}</p>
                        </div>
                      ))}
                      
                      {!selectedSale.items?.length && (
                        <div className="py-4 text-center text-sm text-muted-foreground">Loading items...</div>
                      )}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="bg-background rounded-lg p-5 border border-border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">Subtotal</span>
                      <span className="text-sm text-foreground">{currency} {Number(selectedSale.total_amount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-t border-border mt-2">
                      <span className="text-lg font-bold text-foreground">Total</span>
                      <span className="text-lg font-black text-brand-400">{currency} {Number(selectedSale.total_amount).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="flex-none p-6 border-t border-border bg-background/50">
                  {selectedSale.status === 'COMPLETED' ? (
                    <button
                      onClick={handleProcessReturn}
                      disabled={isReturning}
                      className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
                    >
                      {isReturning ? (
                        <><RefreshCw className="h-5 w-5 animate-spin" /> Processing...</>
                      ) : (
                        <><ArrowLeftRight className="h-5 w-5" /> Process Full Refund</>
                      )}
                    </button>
                  ) : (
                    <div className="w-full flex items-center justify-center gap-2 bg-gray-800 text-muted-foreground font-medium py-3 rounded-xl">
                      <AlertCircle className="h-5 w-5" /> Already Refunded
                    </div>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}