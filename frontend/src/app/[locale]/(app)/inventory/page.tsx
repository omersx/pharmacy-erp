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
  Hash, Calendar, Truck, X, RefreshCw, Calculator, FileText,
  ShieldCheck, AlertCircle, CheckCircle2, History, ShieldAlert
} from 'lucide-react';
import { cn, formatCompactNumber, formatMoney } from '@/lib/utils';
import { useRouter, useParams } from 'next/navigation';
import { ExpiryCenter } from './ExpiryCenter';

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

  // ── Tab State ──
  const [activeTab, setActiveTab] = useState<'catalog' | 'ledger' | 'expiry'>('catalog');

  // ── Data State ──
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
  const [expiredBatches, setExpiredBatches] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(false);

  // ── Filter State for Catalog ──
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low' | 'out' | 'expiring'>('all');

  // ── Filter State for Ledger ──
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('ALL');

  // ── Panel State ──
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
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
  const [adjustMode, setAdjustMode] = useState<'physical' | 'delta'>('physical');
  const [adjustForm, setAdjustForm] = useState({
    medicine_id: '',
    batch_id: '',
    adjustment_type: 'CORRECTION',
    quantity: '',
    new_quantity: '',
    reason: '',
  });
  const [adjustBatches, setAdjustBatches] = useState<any[]>([]);

  // ── Fetch All Data ──
  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'ledger') {
      fetchMovements();
    }
  }, [activeTab, movementTypeFilter]);

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
      setMovements(Array.isArray(movRes) ? movRes : []);
      setSuppliers(supRes as any[]);
    } catch (error) {
      toast.error('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMovements = async () => {
    try {
      setLoadingMovements(true);
      const res: any = await api.getMovements({
        movement_type: movementTypeFilter !== 'ALL' ? movementTypeFilter : undefined,
      });
      setMovements(Array.isArray(res) ? res : []);
    } catch (err) {
      toast.error('Failed to load stock movements');
    } finally {
      setLoadingMovements(false);
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

  // ── Nearest Expiry Lookup ──
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

  const getDaysUntilExpiry = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
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

  // ── Filtered Ledger Movements ──
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      if (!ledgerSearch) return true;
      const q = ledgerSearch.toLowerCase();
      return (
        m.medicine_name?.toLowerCase().includes(q) ||
        m.medicine_sku?.toLowerCase().includes(q) ||
        m.batch_number?.toLowerCase().includes(q) ||
        m.notes?.toLowerCase().includes(q) ||
        m.user_name?.toLowerCase().includes(q)
      );
    });
  }, [movements, ledgerSearch]);

  // ── Selected Batch for Adjustment ──
  const selectedAdjustBatch = useMemo(() => {
    return adjustBatches.find(b => b.id === adjustForm.batch_id) || null;
  }, [adjustBatches, adjustForm.batch_id]);

  // ── Computed Adjustment Difference ──
  const adjustmentCalc = useMemo(() => {
    if (!selectedAdjustBatch) return { delta: 0, newStock: 0, valid: false };
    const current = Number(selectedAdjustBatch.quantity_remaining || 0);

    if (adjustMode === 'physical') {
      const parsed = parseFloat(adjustForm.new_quantity);
      if (isNaN(parsed) || parsed < 0) return { delta: 0, newStock: current, valid: false };
      const delta = parsed - current;
      return { delta, newStock: parsed, valid: Math.abs(delta) > 0.0001 };
    } else {
      const parsed = parseFloat(adjustForm.quantity);
      if (isNaN(parsed) || parsed <= 0) return { delta: 0, newStock: current, valid: false };
      const isAdd = adjustForm.adjustment_type === 'IN';
      const delta = isAdd ? parsed : -parsed;
      const newStock = current + delta;
      return { delta, newStock, valid: newStock >= 0 };
    }
  }, [selectedAdjustBatch, adjustMode, adjustForm.new_quantity, adjustForm.quantity, adjustForm.adjustment_type]);

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
    if (!adjustForm.medicine_id || !adjustForm.batch_id || !adjustForm.reason.trim()) {
      toast.error('Please select medicine, batch, and provide a clear audit reason');
      return;
    }

    if (!adjustmentCalc.valid) {
      toast.error('Please specify a valid adjustment quantity');
      return;
    }

    try {
      setIsSaving(true);
      const payload: any = {
        medicine_id: adjustForm.medicine_id,
        batch_id: adjustForm.batch_id,
        reason: adjustForm.reason.trim(),
        adjustment_type: adjustForm.adjustment_type,
      };

      if (adjustMode === 'physical') {
        payload.new_quantity = Number(adjustForm.new_quantity);
      } else {
        payload.quantity = Number(adjustForm.quantity);
      }

      await api.createAdjustment(payload);
      toast.success('Stock adjusted and audit movement recorded');
      setAdjustOpen(false);
      setAdjustForm({
        medicine_id: '',
        batch_id: '',
        adjustment_type: 'CORRECTION',
        quantity: '',
        new_quantity: '',
        reason: '',
      });
      setAdjustBatches([]);
      fetchData();
      if (activeTab === 'ledger') fetchMovements();
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
        if (batches.length > 0) {
          setAdjustForm(prev => ({
            ...prev,
            medicine_id: medicineId,
            batch_id: batches[0].id,
            new_quantity: String(batches[0].quantity_remaining || '0'),
          }));
        }
      } catch {
        setAdjustBatches([]);
      }
    } else {
      setAdjustBatches([]);
    }
  };

  return (
    <div className="flex flex-col gap-6">

      {/* ── Main Top Bar & Tabs ─────────────────────────────────────────── */}
      <header className="flex-none rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Inventory & Stock Ledger</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Batch-controlled stock management, strict FEFO dispatching, and immutable audit movements
            </p>
          </div>

          {/* Tab Switcher & Quick Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center p-1 bg-background border border-border rounded-xl">
              <button
                onClick={() => setActiveTab('catalog')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all",
                  activeTab === 'catalog'
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Package size={16} />
                Stock Catalog & Batches
              </button>
              <button
                onClick={() => setActiveTab('ledger')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all",
                  activeTab === 'ledger'
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <History size={16} />
                Inventory Ledger & Movements
              </button>
              <button
                onClick={() => setActiveTab('expiry')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all",
                  activeTab === 'expiry'
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ShieldAlert size={16} />
                Expiry & Recall Center
              </button>
            </div>

            <button
              onClick={() => setAdjustOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 px-4 py-2 text-sm font-semibold text-orange-600 dark:text-orange-400 transition-colors shadow-sm"
            >
              <Calculator size={16} />
              Adjust Stock (Audit)
            </button>

            <button
              onClick={() => setAddStockOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors shadow-sm"
            >
              <Plus size={16} />
              Add Batch / Intake
            </button>
          </div>
        </div>
      </header>

      {/* ── KPI Stat Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Products</span>
            <Package size={16} />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{stats.totalProducts}</p>
          <span className="text-xs text-muted-foreground">{totalCurrentStock} units on hand</span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Stock Valuation</span>
            <DollarSign size={16} />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{currency} {formatCompactNumber(stats.totalValue)}</p>
          <span className="text-xs text-muted-foreground">Based on retail selling price</span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Low Stock</span>
            <AlertTriangle size={16} />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-500">{stats.lowStock}</p>
          <span className="text-xs text-muted-foreground">At or below reorder level</span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-rose-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Out of Stock</span>
            <TrendingDown size={16} />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-500">{stats.outOfStock}</p>
          <span className="text-xs text-muted-foreground">Zero units available</span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-purple-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Expiring in 90d</span>
            <Calendar size={16} />
          </div>
          <p className="mt-2 text-2xl font-bold text-purple-500">{stats.expiringSoon}</p>
          <span className="text-xs text-muted-foreground">Batches requiring attention</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: STOCK CATALOG
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'catalog' && (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
          {/* Filters Bar */}
          <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search medicine, SKU, barcode..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 text-foreground"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-background border border-border rounded-xl">
              {(['all', 'in_stock', 'low', 'out', 'expiring'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setStockFilter(f)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize",
                    stockFilter === f
                      ? "bg-brand-500 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface"
                  )}
                >
                  {f === 'all' ? 'All Stock' : f === 'in_stock' ? 'In Stock' : f === 'low' ? 'Low' : f === 'out' ? 'Out' : 'Expiring'}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">Medicine</th>
                  <th className="px-6 py-4 font-semibold hidden md:table-cell">SKU / Barcode</th>
                  <th className="px-6 py-4 font-semibold text-right">Available Qty</th>
                  <th className="px-6 py-4 font-semibold text-center hidden lg:table-cell">Nearest Expiry</th>
                  <th className="px-6 py-4 font-semibold text-right hidden sm:table-cell">Price</th>
                  <th className="px-6 py-4 font-semibold text-right">Valuation</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">Loading stock...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">No stock items match your filter.</td></tr>
                ) : (
                  filteredItems.map(item => {
                    const med = item.medicine;
                    const qty = Number(item.total_quantity);
                    const reorder = med?.reorder_level || 10;
                    const expiry = expiryMap[med?.id];
                    const days = expiry ? getDaysUntilExpiry(expiry) : null;
                    const val = qty * Number(med?.selling_price || 0);

                    return (
                      <tr key={med.id} className="hover:bg-background/50 transition-colors">
                        <td className="px-6 py-4">
                          <button
                            onClick={() => router.push(`/catalog/products/${med.id}`)}
                            className="font-medium text-foreground hover:text-brand-500 text-left transition-colors flex flex-col"
                          >
                            <span>{med.name_en}</span>
                            {med.generic_name && <span className="text-xs text-muted-foreground font-normal">{med.generic_name}</span>}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground font-mono text-xs hidden md:table-cell">
                          {med.sku || med.barcode || '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={cn(
                            "font-bold text-base",
                            qty === 0 ? "text-rose-500" : qty <= reorder ? "text-amber-500" : "text-emerald-500"
                          )}>
                            {qty}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1.5">{med.base_unit || 'Units'}</span>
                        </td>
                        <td className="px-6 py-4 text-center hidden lg:table-cell text-xs font-medium">
                          {days !== null ? (
                            <span className={cn(
                              days <= 0 ? "text-rose-600 font-bold" : days <= 30 ? "text-rose-500 font-semibold" : days <= 90 ? "text-amber-500" : "text-muted-foreground"
                            )}>
                              {days <= 0 ? 'EXPIRED' : `${days} days`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground hidden sm:table-cell">
                          {currency} {Number(med.selling_price || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-foreground">
                          {currency} {val.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {qty === 0 ? (
                            <Badge variant="danger">Out of Stock</Badge>
                          ) : qty <= reorder ? (
                            <Badge variant="warning">Low Stock</Badge>
                          ) : (
                            <Badge variant="success">In Stock</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              onAdjustMedicineChange(med.id);
                              setAdjustOpen(true);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border hover:bg-background text-foreground transition-colors"
                          >
                            Adjust
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2: INVENTORY LEDGER (AUDIT TRAIL)
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ledger' && (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
          {/* Ledger Filter Bar */}
          <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search ledger by product, batch, note..."
                value={ledgerSearch}
                onChange={e => setLedgerSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 text-foreground"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-background border border-border rounded-xl">
              {[
                { id: 'ALL', label: 'All Transactions' },
                { id: 'PURCHASE_RECEIPT', label: 'Purchases' },
                { id: 'SALE_OUT', label: 'Sales' },
                { id: 'SALE_RETURN', label: 'Returns' },
                { id: 'ADJUSTMENT_IN', label: 'Adjust +' },
                { id: 'ADJUSTMENT_OUT', label: 'Adjust -' },
                { id: 'ADJUSTMENT_DAMAGE', label: 'Damage' },
                { id: 'ADJUSTMENT_EXPIRED', label: 'Expired' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setMovementTypeFilter(f.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
                    movementTypeFilter === f.id
                      ? "bg-brand-500 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ledger Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">Date & Time</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Medicine</th>
                  <th className="px-6 py-4 font-semibold hidden md:table-cell">Batch</th>
                  <th className="px-6 py-4 font-semibold text-right">Qty</th>
                  <th className="px-6 py-4 font-semibold text-right hidden sm:table-cell">Unit Cost</th>
                  <th className="px-6 py-4 font-semibold text-right">Value</th>
                  <th className="px-6 py-4 font-semibold hidden lg:table-cell">Audit Notes</th>
                  <th className="px-6 py-4 font-semibold hidden xl:table-cell">Performed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingMovements ? (
                  <tr><td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">Loading inventory ledger...</td></tr>
                ) : filteredMovements.length === 0 ? (
                  <tr><td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">No ledger movements found.</td></tr>
                ) : (
                  filteredMovements.map(m => {
                    const qty = Number(m.quantity);
                    const isPositive = qty > 0;
                    const unitCost = Number(m.unit_cost || 0);
                    const totalCost = Number(m.total_cost || Math.abs(qty) * unitCost);

                    return (
                      <tr key={m.id} className="hover:bg-background/50 transition-colors">
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          {new Date(m.created_at).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1",
                            isPositive
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          )}>
                            {isPositive ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />}
                            {m.movement_type.replace('ADJUSTMENT_', '')}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-foreground">
                          {m.medicine_name || 'Medicine'}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-muted-foreground hidden md:table-cell">
                          {m.batch_number || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-right font-extrabold text-base">
                          <span className={isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                            {isPositive ? '+' : ''}{qty}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground text-xs hidden sm:table-cell">
                          {currency} {unitCost.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-foreground">
                          {currency} {totalCost.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground max-w-xs truncate hidden lg:table-cell" title={m.notes || ''}>
                          {m.notes || '—'}
                        </td>
                        <td className="px-6 py-4 text-xs text-foreground/80 hidden xl:table-cell">
                          {m.user_name || 'System'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 3: EXPIRY & RECALL CONTROL CENTER (ISSUES #11 & #12)
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'expiry' && <ExpiryCenter />}

      {/* ═══════════════════════════════════════════════════════════════════
          SLIDE-OVER: Add New Batch (Stock Intake)
          ═══════════════════════════════════════════════════════════════════ */}
      <SlideOver
        open={addStockOpen}
        onClose={() => setAddStockOpen(false)}
        title="Add Batch Intake"
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
              {isSaving ? 'Saving...' : 'Confirm Intake'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-6">
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
              <label className="text-sm font-medium text-muted-foreground">Quantity Received *</label>
              <input
                type="number" min="1"
                value={addForm.quantity}
                onChange={e => setAddForm({ ...addForm, quantity: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
                placeholder="100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Purchase Price ({currency}) *</label>
              <input
                type="number" step="0.01" min="0"
                value={addForm.purchase_price}
                onChange={e => setAddForm({ ...addForm, purchase_price: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
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
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-brand-500 focus:outline-none"
              placeholder="e.g. BATCH-2026-A1"
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Expiry Date *</label>
              <input
                type="date"
                value={addForm.expiry_date}
                onChange={e => setAddForm({ ...addForm, expiry_date: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </SlideOver>

      {/* ═══════════════════════════════════════════════════════════════════
          SLIDE-OVER: Stock Adjustment (Strict Controlled Audit)
          ═══════════════════════════════════════════════════════════════════ */}
      <SlideOver
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Inventory Adjustment & Reconciliation"
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setAdjustOpen(false)} className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAdjustStock}
              disabled={isSaving || !adjustmentCalc.valid}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-orange-600 px-5 text-sm font-bold text-white transition-all hover:bg-orange-700 disabled:opacity-50 shadow-md shadow-orange-600/20"
            >
              {isSaving ? 'Recording Audit...' : 'Commit Adjustment'}
            </button>
          </div>
        }
      >
        <div className="space-y-5 pb-6">
          <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-600 dark:text-orange-400">
            <span className="font-bold block mb-1">Strict Inventory Control</span>
            Direct quantity overwrites are prohibited. Every adjustment logs an immutable movement in the ledger with your signature.
          </div>

          {/* Mode Switcher */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
              Adjustment Method
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-background rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setAdjustMode('physical')}
                className={cn(
                  "py-2 px-3 rounded-lg text-xs font-bold transition-all",
                  adjustMode === 'physical'
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Physical Count (New Count)
              </button>
              <button
                type="button"
                onClick={() => setAdjustMode('delta')}
                className={cn(
                  "py-2 px-3 rounded-lg text-xs font-bold transition-all",
                  adjustMode === 'delta'
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Manual Delta (+ / - Units)
              </button>
            </div>
          </div>

          {/* Medicine Select */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Medicine *</label>
            <Select
              value={adjustForm.medicine_id}
              onChange={onAdjustMedicineChange}
              options={medicines.map(m => ({ value: m.id, label: `${m.name_en}${m.strength ? ` (${m.strength})` : ''}` }))}
              placeholder="Select medicine to adjust..."
            />
          </div>

          {/* Batch Select */}
          {adjustForm.medicine_id && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">Batch *</label>
              {adjustBatches.length === 0 ? (
                <p className="text-xs text-rose-500 italic py-1">No batches found for this medicine.</p>
              ) : (
                <Select
                  value={adjustForm.batch_id}
                  onChange={v => {
                    const b = adjustBatches.find(x => x.id === v);
                    setAdjustForm({
                      ...adjustForm,
                      batch_id: v,
                      new_quantity: b ? String(b.quantity_remaining) : '',
                    });
                  }}
                  options={adjustBatches.map(b => ({
                    value: b.id,
                    label: `${b.batch_number} — Qty: ${Number(b.quantity_remaining)} — Exp: ${new Date(b.expiry_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
                  }))}
                  placeholder="Select batch..."
                />
              )}
            </div>
          )}

          {/* Quantity Inputs Depending on Mode */}
          {selectedAdjustBatch && (
            <>
              {adjustMode === 'physical' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                    Actual Physical Count *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={adjustForm.new_quantity}
                    onChange={e => setAdjustForm({ ...adjustForm, new_quantity: e.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-base font-bold text-foreground focus:border-brand-500 focus:outline-none"
                    placeholder="Counted quantity on shelf"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustForm({ ...adjustForm, adjustment_type: 'IN' })}
                      className={cn(
                        "py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2",
                        adjustForm.adjustment_type === 'IN'
                          ? "bg-emerald-500/10 border-emerald-500 text-emerald-600"
                          : "border-border text-muted-foreground hover:bg-background"
                      )}
                    >
                      <ArrowDownCircle size={15} /> Add Stock (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustForm({ ...adjustForm, adjustment_type: 'OUT' })}
                      className={cn(
                        "py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2",
                        adjustForm.adjustment_type !== 'IN'
                          ? "bg-rose-500/10 border-rose-500 text-rose-600"
                          : "border-border text-muted-foreground hover:bg-background"
                      )}
                    >
                      <ArrowUpCircle size={15} /> Remove Stock (-)
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                      Quantity to {adjustForm.adjustment_type === 'IN' ? 'Add' : 'Deduct'} *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={adjustForm.quantity}
                      onChange={e => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-base font-bold text-foreground focus:border-brand-500 focus:outline-none"
                      placeholder="e.g. 10"
                    />
                  </div>
                </div>
              )}

              {/* Live Preview Card */}
              <div className="p-4 rounded-xl bg-background border border-border space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Reconciliation Preview
                </span>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Current Stock in System:</span>
                  <span className="font-bold text-foreground">{Number(selectedAdjustBatch.quantity_remaining)} units</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Net Ledger Adjustment:</span>
                  <span className={cn("font-bold text-sm", adjustmentCalc.delta > 0 ? "text-emerald-500" : adjustmentCalc.delta < 0 ? "text-rose-500" : "text-muted-foreground")}>
                    {adjustmentCalc.delta > 0 ? '+' : ''}{adjustmentCalc.delta} units
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-border/80">
                  <span className="font-semibold text-foreground">New Resulting Stock:</span>
                  <span className="font-extrabold text-brand-400 text-sm">{adjustmentCalc.newStock} units</span>
                </div>
              </div>

              {/* Reason Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  Reason Category *
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'CORRECTION', label: 'Count Correction' },
                    { id: 'DAMAGE', label: 'Damaged / Broken' },
                    { id: 'EXPIRED', label: 'Expired Disposal' },
                    { id: 'THEFT_LOSS', label: 'Loss / Shortage' },
                    { id: 'INTERNAL_USE', label: 'Clinic / Store Use' },
                  ].map(r => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => setAdjustForm({ ...adjustForm, adjustment_type: r.id })}
                      className={cn(
                        "p-2 rounded-lg border text-left font-medium transition-colors",
                        adjustForm.adjustment_type === r.id
                          ? "bg-brand-500/10 border-brand-500 text-brand-600 dark:text-brand-400"
                          : "border-border text-muted-foreground hover:bg-background"
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audit Explanation */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  Detailed Explanation *
                </label>
                <textarea
                  rows={2}
                  value={adjustForm.reason}
                  onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none resize-none"
                  placeholder="Explain why this adjustment is made (e.g. Annual physical count variance, box dropped and broken, etc.)..."
                />
              </div>
            </>
          )}
        </div>
      </SlideOver>
    </div>
  );
}