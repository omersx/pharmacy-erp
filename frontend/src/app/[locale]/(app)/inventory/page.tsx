'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { SlideOver } from '@/components/ui/slide-over';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import {
  Search, Plus, Settings2, Clock, Package, AlertTriangle,
  TrendingDown, DollarSign, ArrowUpCircle, ArrowDownCircle,
  Hash, Calendar, Truck, X
} from 'lucide-react';
import { cn, formatCompactNumber } from '@/lib/utils';
import { useRouter, useParams } from 'next/navigation';

// ─── Types ───────────────────────────────────────────────────────────────
interface StockItem {
  medicine: any;
  total_quantity: number;
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function InventoryPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const { currency } = useAppStore();

  // ── Data State ──
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
  const [expiredBatches, setExpiredBatches] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filter State ──
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low' | 'out' | 'expiring'>('all');

  // ── Panel State ──
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Add Stock Form ──
  const [addForm, setAddForm] = useState({
    medicine_id: '',
    batch_number: '',
    quantity: '',
    purchase_price: '',
    production_date: '',
    expiry_date: '',
    supplier_id: '',
  });

  // ── Adjust Stock Form ──
  const [adjustForm, setAdjustForm] = useState({
    medicine_id: '',
    batch_id: '',
    adjustment_type: 'IN',
    quantity: '',
    reason: '',
  });
  const [adjustBatches, setAdjustBatches] = useState<any[]>([]);

  // ── Fetch All Data ──
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [stockRes, medsRes, lowRes, expiringRes, expiredRes, movRes, supRes] = await Promise.all([
        api.getStock().catch(() => []),
        api.getMedicines().catch(() => []),
        api.getLowStock().catch(() => []),
        api.getExpiring().catch(() => []),
        api.getExpired().catch(() => []),
        api.getMovements().catch(() => []),
        api.getSuppliers().catch(() => []),
      ]);
      setStockItems(stockRes as StockItem[]);
      setMedicines(medsRes as any[]);
      setLowStockItems(lowRes as any[]);
      setExpiringBatches(expiringRes as any[]);
      setExpiredBatches(expiredRes as any[]);
      setMovements(movRes as any[]);
      setSuppliers(supRes as any[]);
    } catch (error) {
      toast.error('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  // ── Computed Stats ──
  const stats = useMemo(() => {
    const totalProducts = stockItems.length;
    const lowStock = stockItems.filter(item => {
      const qty = Number(item.total_quantity);
      const reorder = (item.medicine?.reorder_level && item.medicine.reorder_level > 0) ? item.medicine.reorder_level : 10;
      return qty > 0 && qty <= reorder;
    }).length;
    const outOfStock = stockItems.filter(item => Number(item.total_quantity) === 0).length;
    const expiringSoon = expiringBatches.length;
    const totalValue = stockItems.reduce((sum, item) => {
      return sum + (Number(item.total_quantity) * Number(item.medicine?.selling_price || 0));
    }, 0);
    return { totalProducts, lowStock, outOfStock, expiringSoon, totalValue };
  }, [stockItems, expiringBatches]);

  const totalCurrentStock = useMemo(() => {
    return stockItems.reduce((sum, item) => sum + Number(item.total_quantity || 0), 0);
  }, [stockItems]);

  // ── Medicine Name Lookup ──
  const getMedicineName = (id: string) => {
    const med = medicines.find(m => m.id === id);
    return med?.name_en || 'Unknown';
  };

  // ── Nearest Expiry Lookup (from expiring batches) ──
  const expiryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const batch of [...expiringBatches, ...expiredBatches]) {
      const medId = batch.medicine_id;
      if (!map[medId] || new Date(batch.expiry_date) < new Date(map[medId])) {
        map[medId] = batch.expiry_date;
      }
    }
    return map;
  }, [expiringBatches, expiredBatches]);

  // ── Expiry Helpers ──
  const getDaysUntilExpiry = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getExpiryColor = (days: number) => {
    if (days <= 0) return 'text-red-400';
    if (days <= 30) return 'text-red-400';
    if (days <= 60) return 'text-amber-400';
    return 'text-yellow-400';
  };

  // ── Filtered Stock Items ──
  const filteredItems = useMemo(() => {
    return stockItems.filter(item => {
      const med = item.medicine;
      const qty = Number(item.total_quantity);
      const reorder = (med?.reorder_level && med.reorder_level > 0) ? med.reorder_level : 10;

      const matchSearch = search === '' ||
        med?.name_en?.toLowerCase().includes(search.toLowerCase()) ||
        med?.sku?.toLowerCase().includes(search.toLowerCase()) ||
        med?.barcode?.toLowerCase().includes(search.toLowerCase());

      const matchFilter =
        stockFilter === 'all' ||
        (stockFilter === 'in_stock' && qty > reorder) ||
        (stockFilter === 'low' && qty > 0 && qty <= reorder) ||
        (stockFilter === 'out' && qty === 0) ||
        (stockFilter === 'expiring' && expiryMap[med?.id] && getDaysUntilExpiry(expiryMap[med?.id]) <= 90);

      return matchSearch && matchFilter;
    });
  }, [stockItems, search, stockFilter]);

  // ── Stock Status Helper ──
  const getStockStatus = (qty: number, reorderLevel: number) => {
    if (qty === 0) return { label: 'Out of Stock', variant: 'danger' as const, color: 'text-red-400' };
    if (qty <= reorderLevel) return { label: 'Low Stock', variant: 'warning' as const, color: 'text-amber-400' };
    return { label: 'In Stock', variant: 'success' as const, color: 'text-green-400' };
  };


  // ── Add Stock Handler ──
  const handleAddStock = async () => {
    if (!addForm.medicine_id || !addForm.quantity || !addForm.purchase_price || !addForm.expiry_date) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      setIsSaving(true);
      await api.createBatch(addForm.medicine_id, {
        batch_number: addForm.batch_number || `BATCH-${Date.now().toString().slice(-6)}`,
        quantity_received: Number(addForm.quantity),
        purchase_price: Number(addForm.purchase_price),
        production_date: addForm.production_date || null,
        expiry_date: addForm.expiry_date,
        supplier_id: addForm.supplier_id || null,
      });
      toast.success('Stock added successfully');
      setAddStockOpen(false);
      setAddForm({ medicine_id: '', batch_number: '', quantity: '', purchase_price: '', production_date: '', expiry_date: '', supplier_id: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add stock');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Adjust Stock Handler ──
  const handleAdjustStock = async () => {
    if (!adjustForm.medicine_id || !adjustForm.batch_id || !adjustForm.quantity || !adjustForm.reason) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      setIsSaving(true);
      await api.createAdjustment({
        medicine_id: adjustForm.medicine_id,
        batch_id: adjustForm.batch_id,
        quantity: Number(adjustForm.quantity),
        reason: adjustForm.reason,
        adjustment_type: adjustForm.adjustment_type,
      });
      toast.success('Stock adjusted successfully');
      setAdjustOpen(false);
      setAdjustForm({ medicine_id: '', batch_id: '', adjustment_type: 'IN', quantity: '', reason: '' });
      setAdjustBatches([]);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to adjust stock');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Fetch Batches for Adjust Form ──
  const onAdjustMedicineChange = async (medicineId: string) => {
    setAdjustForm(prev => ({ ...prev, medicine_id: medicineId, batch_id: '' }));
    if (medicineId) {
      try {
        const batches = await api.getMedicineStock(medicineId) as any[];
        setAdjustBatches(batches);
      } catch {
        setAdjustBatches([]);
      }
    } else {
      setAdjustBatches([]);
    }
  };

  // ── Stock Progress Bar ──
  const StockBar = ({ qty, reorder }: { qty: number; reorder: number }) => {
    const max = Math.max(reorder * 2, qty, 1);
    const percent = Math.min((qty / max) * 100, 100);
    const color = qty === 0 ? 'bg-red-500' : qty <= reorder ? 'bg-amber-500' : 'bg-green-500';
    return (
      <div className="flex items-center gap-3">
        <span className={cn("font-semibold text-sm tabular-nums w-8 text-right", qty === 0 ? 'text-red-400' : qty <= reorder ? 'text-amber-400' : 'text-foreground')}>
          {qty}
        </span>
        <div className="flex-1 h-2 bg-border rounded-full overflow-hidden min-w-[60px]">
          <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-none rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Inventory</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Current Stock: <span className="text-foreground font-semibold text-base">{totalCurrentStock.toLocaleString()}</span> units
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAddForm({ medicine_id: '', batch_number: `BATCH-${Date.now().toString().slice(-6)}`, quantity: '', purchase_price: '', production_date: '', expiry_date: '', supplier_id: '' });
                setAddStockOpen(true);
              }}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 gap-2 shadow-lg shadow-brand-500/20"
            >
              <Plus className="h-4 w-4" />
              Add Stock
            </button>
            <button
              onClick={() => {
                setAdjustForm({ medicine_id: '', batch_id: '', adjustment_type: 'IN', quantity: '', reason: '' });
                setAdjustBatches([]);
                setAdjustOpen(true);
              }}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface gap-2"
            >
              <Settings2 className="h-4 w-4" />
              Adjust Stock
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface gap-2"
            >
              <Clock className="h-4 w-4" />
              View History
            </button>
          </div>
        </div>
      </header>

      {/* ── Stat Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <button onClick={() => setStockFilter('all')} className="rounded-xl border border-border bg-surface p-5 shadow-sm text-left hover:border-brand-500/50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
              <Package className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Products</p>
              <p className="text-2xl font-bold text-foreground">{stats.totalProducts}</p>
            </div>
          </div>
        </button>

        <button onClick={() => setStockFilter('out')} className="rounded-xl border border-border bg-surface p-5 shadow-sm text-left hover:border-red-500/50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <Package className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Out of Stock</p>
              <p className="text-2xl font-bold text-red-500">{stats.outOfStock}</p>
            </div>
          </div>
        </button>

        <button onClick={() => setStockFilter('low')} className="rounded-xl border border-border bg-surface p-5 shadow-sm text-left hover:border-amber-500/50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <TrendingDown className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Low Stock</p>
              <p className="text-2xl font-bold text-amber-500">{stats.lowStock}</p>
            </div>
          </div>
        </button>

        <button onClick={() => setStockFilter('expiring')} className="rounded-xl border border-border bg-surface p-5 shadow-sm text-left hover:border-red-500/50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Expiring Soon</p>
              <p className="text-2xl font-bold text-red-500">{stats.expiringSoon}</p>
            </div>
          </div>
        </button>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stock Value</p>
              <p className="text-2xl font-bold text-foreground">{formatCompactNumber(stats.totalValue).toLowerCase()} <span className="text-sm font-normal text-muted-foreground">{currency}</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filters ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, SKU, or barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-center rounded-lg border border-border bg-background p-1 overflow-x-auto w-full sm:w-auto">
            {(['all', 'in_stock', 'low', 'out', 'expiring'] as const).map(filter => {
              const labels: Record<string, string> = { all: 'All', in_stock: 'In Stock', low: 'Low', out: 'Out', expiring: 'Expiring' };
              const isActive = stockFilter === filter;
              return (
                <button
                  key={filter}
                  onClick={() => setStockFilter(filter)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap",
                    isActive
                      ? filter === 'low' ? 'bg-amber-500/20 text-amber-400'
                        : filter === 'out' ? 'bg-red-500/20 text-red-400'
                          : filter === 'expiring' ? 'bg-orange-500/20 text-orange-400'
                            : filter === 'in_stock' ? 'bg-green-500/20 text-green-400'
                              : 'bg-brand-500/20 text-brand-400'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {labels[filter]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Stock Table ─────────────────────────────────────────────────── */}
      <main className="rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-foreground">
            <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">Product Name</th>
                <th className="px-6 py-4 font-semibold hidden md:table-cell">SKU</th>
                <th className="px-6 py-4 font-semibold w-48">Stock Level</th>
                <th className="px-6 py-4 font-semibold hidden lg:table-cell">Nearest Expiry</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-border rounded w-3/4" /></td>
                    <td className="px-6 py-4 hidden md:table-cell"><div className="h-4 bg-border rounded w-1/2" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-border rounded w-full" /></td>
                    <td className="px-6 py-4 hidden lg:table-cell"><div className="h-4 bg-border rounded w-2/3" /></td>
                    <td className="px-6 py-4"><div className="h-4 bg-border rounded w-1/3" /></td>
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-medium text-foreground">No items found</h3>
                      <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const med = item.medicine;
                  const qty = Number(item.total_quantity);
                  const reorder = (med?.reorder_level && med.reorder_level > 0) ? med.reorder_level : 10;
                  const status = getStockStatus(qty, reorder);
                  const nearestExpiry = expiryMap[med?.id];
                  const daysLeft = nearestExpiry ? getDaysUntilExpiry(nearestExpiry) : null;

                  return (
                    <tr 
                      key={med?.id} 
                      onClick={() => router.push(`/${locale}/catalog/products/${med?.id}`)}
                      className="transition-colors hover:bg-background/50 group cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{med?.name_en}</span>
                          {med?.strength && <span className="text-xs text-brand-500 mt-0.5">{med.strength}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <span className="font-mono text-xs text-muted-foreground">{med?.sku}</span>
                      </td>
                      <td className="px-6 py-4">
                        <StockBar qty={qty} reorder={reorder} />
                      </td>
                      <td className="px-6 py-4 hidden lg:table-cell">
                        {nearestExpiry ? (
                          <div className="flex flex-col">
                            <span className={cn("text-sm font-medium", getExpiryColor(daysLeft || 0))}>
                              {new Date(nearestExpiry).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                            </span>
                            <span className={cn("text-xs", getExpiryColor(daysLeft || 0))}>
                              {daysLeft !== null && daysLeft <= 0 ? 'Expired' : `${daysLeft}d left`}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════════════════
          SLIDE-OVER: Add Stock
          ═══════════════════════════════════════════════════════════════════ */}
      <SlideOver
        open={addStockOpen}
        onClose={() => setAddStockOpen(false)}
        title="Add Stock"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setAddStockOpen(false)} className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAddStock}
              disabled={isSaving}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {isSaving ? 'Adding...' : 'Add Stock'}
            </button>
          </div>
        }
      >
        <div className="space-y-6 pb-6">
          {/* Medicine Select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Medicine *</label>
            <Select
              value={addForm.medicine_id}
              onChange={v => setAddForm({ ...addForm, medicine_id: v })}
              options={medicines.map(m => ({ value: m.id, label: `${m.name_en}${m.strength ? ` (${m.strength})` : ''}` }))}
              placeholder="Select medicine..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Quantity *</label>
              <input
                type="number" min="1"
                value={addForm.quantity}
                onChange={e => setAddForm({ ...addForm, quantity: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Purchase Price ({currency}) *</label>
              <input
                type="number" step="0.01" min="0"
                value={addForm.purchase_price}
                onChange={e => setAddForm({ ...addForm, purchase_price: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="8.50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Batch Number</label>
            <input
              type="text"
              value={addForm.batch_number}
              onChange={e => setAddForm({ ...addForm, batch_number: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Supplier</label>
            <Select
              value={addForm.supplier_id}
              onChange={v => setAddForm({ ...addForm, supplier_id: v })}
              options={suppliers.map(s => ({ value: s.id, label: s.name }))}
              placeholder="Select supplier..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Production Date</label>
              <input
                type="date"
                value={addForm.production_date}
                onChange={e => setAddForm({ ...addForm, production_date: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Expiry Date *</label>
              <input
                type="date"
                value={addForm.expiry_date}
                onChange={e => setAddForm({ ...addForm, expiry_date: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>
      </SlideOver>

      {/* ═══════════════════════════════════════════════════════════════════
          SLIDE-OVER: Adjust Stock
          ═══════════════════════════════════════════════════════════════════ */}
      <SlideOver
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust Stock"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setAdjustOpen(false)} className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAdjustStock}
              disabled={isSaving}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {isSaving ? 'Adjusting...' : 'Confirm Adjustment'}
            </button>
          </div>
        }
      >
        <div className="space-y-6 pb-6">
          {/* Medicine Select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Medicine *</label>
            <Select
              value={adjustForm.medicine_id}
              onChange={onAdjustMedicineChange}
              options={medicines.map(m => ({ value: m.id, label: `${m.name_en}${m.strength ? ` (${m.strength})` : ''}` }))}
              placeholder="Select medicine..."
            />
          </div>

          {/* Batch Select (loads after medicine is picked) */}
          {adjustForm.medicine_id && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Batch *</label>
              {adjustBatches.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-2">No batches with remaining stock found for this medicine.</p>
              ) : (
                <Select
                  value={adjustForm.batch_id}
                  onChange={v => setAdjustForm({ ...adjustForm, batch_id: v })}
                  options={adjustBatches.map(b => ({
                    value: b.id,
                    label: `${b.batch_number} — Qty: ${Number(b.quantity_remaining)} — Exp: ${new Date(b.expiry_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
                  }))}
                  placeholder="Select batch..."
                />
              )}
            </div>
          )}

          {/* Adjustment Type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Adjustment Type *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAdjustForm({ ...adjustForm, adjustment_type: 'IN' })}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all",
                  adjustForm.adjustment_type === 'IN'
                    ? 'border-green-500 bg-green-500/10 text-green-400'
                    : 'border-border bg-background text-muted-foreground hover:border-green-500/50'
                )}
              >
                <ArrowUpCircle className="h-5 w-5" />
                Add Stock
              </button>
              <button
                type="button"
                onClick={() => setAdjustForm({ ...adjustForm, adjustment_type: 'OUT' })}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all",
                  adjustForm.adjustment_type === 'OUT'
                    ? 'border-red-500 bg-red-500/10 text-red-400'
                    : 'border-border bg-background text-muted-foreground hover:border-red-500/50'
                )}
              >
                <ArrowDownCircle className="h-5 w-5" />
                Remove Stock
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Quantity *</label>
            <input
              type="number" min="1"
              value={adjustForm.quantity}
              onChange={e => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Enter quantity"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Reason *</label>
            <textarea
              rows={3}
              value={adjustForm.reason}
              onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              placeholder="e.g. Damaged goods, stocktake correction, returned items..."
            />
          </div>
        </div>
      </SlideOver>

      {/* ═══════════════════════════════════════════════════════════════════
          SLIDE-OVER: View History
          ═══════════════════════════════════════════════════════════════════ */}
      <SlideOver
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Inventory History"
      >
        <div className="space-y-3 pb-6">
          {movements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground">No history yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Stock movements will appear here.</p>
            </div>
          ) : (
            movements.map((mov, i) => {
              const isIn = mov.movement_type === 'IN' || mov.movement_type === 'ADD' || mov.movement_type === 'SALE_RETURN';
              return (
                <div key={mov.id || i} className="flex items-start gap-3 rounded-lg border border-border bg-background p-4">
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", isIn ? 'bg-green-500/10' : 'bg-red-500/10')}>
                    {isIn ? <ArrowUpCircle className="h-5 w-5 text-green-500" /> : <ArrowDownCircle className="h-5 w-5 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-foreground">{getMedicineName(mov.medicine_id)}</span>
                      <span className={cn("font-semibold text-sm tabular-nums", isIn ? 'text-green-400' : 'text-red-400')}>
                        {isIn ? '+' : '-'}{Number(mov.quantity)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={isIn ? 'success' : 'danger'}>{mov.movement_type}</Badge>
                      {mov.notes && <span className="text-xs text-muted-foreground truncate">{mov.notes}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {new Date(mov.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SlideOver>
    </div>
  );
}