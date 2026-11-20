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
  ShieldCheck, AlertCircle, CheckCircle2, History, ShieldAlert,
  Boxes, Store, Archive, Download
} from 'lucide-react';
import { cn, formatCompactNumber, formatMoney, formatDateTime } from '@/lib/utils';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ExpiryCenter } from './ExpiryCenter';
import { ShelfRefillCenter } from './ShelfRefillCenter';
import { InventorySettingsModal } from './InventorySettingsModal';
import { MoveToStoreModal } from './MoveToStoreModal';

// ─── Types ───────────────────────────────────────────────────────────────
interface StockItem {
  medicine: any;
  total_quantity: number;
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function InventoryPage() {
  const t = useTranslations('inventory');
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const isAr = locale === 'ar';
  const { currency, inventoryMode } = useAppStore();
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const formatUnit = (unitStr?: string) => {
    if (!unitStr) return t('units.units');
    const lower = unitStr.toLowerCase();
    if (lower.includes('box')) return t('units.box');
    if (lower.includes('pack')) return t('units.packs');
    if (lower.includes('unit')) return t('units.units');
    if (lower.includes('bottle')) return t('units.bottle');
    if (lower.includes('strip')) return t('units.strip');
    if (lower.includes('vial')) return t('units.vial');
    if (lower.includes('carton')) return t('units.carton');
    return unitStr;
  };

  // ── Tab State ──
  const [activeTab, setActiveTab] = useState<'catalog' | 'ledger' | 'expiry' | 'refill'>('catalog');
  const [refillCount, setRefillCount] = useState<number>(0);

  // ── Data State ──
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<any[]>([]);
  const [expiredBatches, setExpiredBatches] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [locationSummary, setLocationSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(false);

  // ── Filter State for Catalog ──
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low' | 'out' | 'expiring' | 'refill'>('all');
  const [catalogViewMode, setCatalogViewMode] = useState<'location' | 'standard'>('location');

  // ── Filter State for Ledger ──
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('ALL');

  // ── Panel State ──
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [moveToStoreItem, setMoveToStoreItem] = useState<{
    medicine: any;
    shelfStock: number;
    whStock: number;
    unit: string;
  } | null>(null);

  // ── Add Stock Form ──
  const [addForm, setAddForm] = useState({
    medicine_id: '',
    batch_number: '',
    quantity: '',
    purchase_price: '',
    production_date: '',
    expiry_date: '',
    supplier_id: '',
    target_location: 'shelf' as 'shelf' | 'warehouse',
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

  useEffect(() => {
    if (inventoryMode === 'simple' && activeTab === 'refill') {
      setActiveTab('catalog');
    }
  }, [inventoryMode, activeTab]);

  const fetchRefillCount = async () => {
    try {
      const suggestions = await api.getRefillSuggestions();
      setRefillCount(Array.isArray(suggestions) ? suggestions.length : 0);
    } catch {
      // quiet fallback
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [stockRes, medsRes, lowRes, expiringRes, expiredRes, movRes, supRes, refillRes, locSummaryRes] = await Promise.all([
        api.getStock().catch(() => []),
        api.getMedicines().catch(() => []),
        api.getLowStock().catch(() => []),
        api.getExpiring().catch(() => []),
        api.getExpired().catch(() => []),
        api.getMovements().catch(() => []),
        api.getSuppliers().catch(() => []),
        api.getRefillSuggestions().catch(() => []),
        api.getLocationStockSummary().catch(() => []),
      ]);
      setStockItems(stockRes as StockItem[]);
      setMedicines(medsRes as any[]);
      setLowStockItems(lowRes as any[]);
      setExpiringBatches(expiringRes as any[]);
      setExpiredBatches(expiredRes as any[]);
      setMovements(Array.isArray(movRes) ? movRes : []);
      setSuppliers(supRes as any[]);
      setRefillCount(Array.isArray(refillRes) ? refillRes.length : 0);
      setLocationSummary(Array.isArray(locSummaryRes) ? locSummaryRes : []);
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

  // ── Location Stock Breakdown Map (Shelf vs Warehouse) ──
  const locationMap = useMemo(() => {
    const map: Record<string, { shelf_stock: number; warehouse_stock: number; other_stock: number; total_stock: number; needs_refill: boolean }> = {};
    for (const item of locationSummary) {
      if (!item?.medicine_id) continue;
      map[item.medicine_id] = {
        shelf_stock: Number(item.shelf_stock || 0),
        warehouse_stock: Number(item.warehouse_stock || 0),
        other_stock: Number(item.other_locations_stock || 0),
        total_stock: Number(item.total_stock || 0),
        needs_refill: Boolean(item.needs_refill),
      };
    }
    return map;
  }, [locationSummary]);

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
      const loc = locationMap[med?.id];

      const matchSearch = search === '' ||
        med?.name_en?.toLowerCase().includes(search.toLowerCase()) ||
        med?.sku?.toLowerCase().includes(search.toLowerCase()) ||
        med?.barcode?.toLowerCase().includes(search.toLowerCase());

      const matchFilter =
        stockFilter === 'all' ||
        (stockFilter === 'in_stock' && qty > reorder) ||
        (stockFilter === 'low' && qty > 0 && qty <= reorder) ||
        (stockFilter === 'out' && qty === 0) ||
        (stockFilter === 'expiring' && expiryMap[med?.id] && getDaysUntilExpiry(expiryMap[med?.id]) <= 90) ||
        (stockFilter === 'refill' && Boolean(loc?.needs_refill));

      return matchSearch && matchFilter;
    });
  }, [stockItems, search, stockFilter, expiryMap, locationMap]);

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
      const created: any = await api.createBatch(addForm.medicine_id, {
        batch_number: addForm.batch_number || `BATCH-${Date.now().toString().slice(-6)}`,
        quantity_received: Number(addForm.quantity),
        purchase_price: Number(addForm.purchase_price),
        production_date: addForm.production_date || null,
        expiry_date: addForm.expiry_date,
        supplier_id: addForm.supplier_id || null,
      });

      // If user selected Back Store destination in multi-location mode
      if (inventoryMode === 'multi_location' && addForm.target_location === 'warehouse') {
        try {
          await api.moveToWarehouse({
            medicine_id: addForm.medicine_id,
            quantity: Number(addForm.quantity),
            batch_id: created?.id,
            notes: 'Intake directly to Back Store (Warehouse)',
          });
        } catch (mErr) {
          console.warn('Auto-move to warehouse notice:', mErr);
        }
      }

      toast.success(
        addForm.target_location === 'warehouse'
          ? (isAr ? 'تم استلام الدفعة وإيداعها في المستودع 📦 بنجاح' : 'Batch added and stored in Back Store 📦 successfully')
          : (isAr ? 'تم استلام المخزون وإضافته على الرف 🟢 بنجاح' : 'Stock added to Shelf 🟢 successfully')
      );
      setAddStockOpen(false);
      setAddForm({
        medicine_id: '',
        batch_number: '',
        quantity: '',
        purchase_price: '',
        production_date: '',
        expiry_date: '',
        supplier_id: '',
        target_location: 'shelf',
      });
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('subtitle')}
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
                <span>{t('tabs.catalogBatches')}</span>
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
                <span>{t('tabs.ledgerMovements')}</span>
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
                <span>{t('tabs.expiryRecall')}</span>
              </button>
              {inventoryMode === 'multi_location' && (
                <button
                  onClick={() => setActiveTab('refill')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all relative",
                    activeTab === 'refill'
                      ? "bg-brand-500 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Boxes size={16} />
                  <span>{t('tabs.shelfRefill')}</span>
                  {refillCount > 0 && (
                    <span className="ml-1 rtl:mr-1 rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 animate-pulse">
                      {refillCount}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Inventory Operating Mode Settings Button */}
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background hover:bg-surface px-3.5 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-all shadow-sm"
              title={isAr ? "إعدادات نمط المخزون" : "Inventory Mode Settings"}
            >
              <Settings2 size={16} className="text-brand-500" />
              <span className="hidden sm:inline">
                {isAr ? "نمط المخزون" : "Inventory Mode"}
              </span>
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider",
                inventoryMode === 'simple'
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
              )}>
                {inventoryMode === 'simple' ? (isAr ? 'بسيط' : 'Simple') : (isAr ? 'مستودع' : 'Warehouse')}
              </span>
            </button>

            <button
              onClick={() => setAdjustOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 px-4 py-2 text-sm font-semibold text-orange-600 dark:text-orange-400 transition-colors shadow-sm"
            >
              <Calculator size={16} />
              {t('adjustStockAudit')}
            </button>

            <button
              onClick={() => setAddStockOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors shadow-sm"
            >
              <Plus size={16} />
              {t('addBatchIntake')}
            </button>
          </div>
        </div>
      </header>

      {/* ── KPI Stat Cards (Catalog Overview Only) ────────────────────── */}
      {activeTab === 'catalog' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">{t('stats.totalProducts')}</span>
              <Package size={16} />
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{stats.totalProducts.toLocaleString()}</p>
            <span className="text-xs text-muted-foreground">{t('stats.unitsOnHand', { count: totalCurrentStock.toLocaleString() })}</span>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-semibold uppercase tracking-wider">{t('stats.stockValuation')}</span>
              <DollarSign size={16} />
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{currency} {formatCompactNumber(stats.totalValue)}</p>
            <span className="text-xs text-muted-foreground">{t('stats.retailPriceDesc')}</span>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-amber-500">
              <span className="text-xs font-semibold uppercase tracking-wider">{t('stats.lowStock')}</span>
              <AlertTriangle size={16} />
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-500">{stats.lowStock}</p>
            <span className="text-xs text-muted-foreground">{t('stats.reorderLevelDesc')}</span>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-rose-500">
              <span className="text-xs font-semibold uppercase tracking-wider">{t('stats.outOfStock')}</span>
              <TrendingDown size={16} />
            </div>
            <p className="mt-2 text-2xl font-bold text-rose-500">{stats.outOfStock}</p>
            <span className="text-xs text-muted-foreground">{t('stats.zeroUnitsDesc')}</span>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-purple-500">
              <span className="text-xs font-semibold uppercase tracking-wider">{t('stats.expiring90d')}</span>
              <Calendar size={16} />
            </div>
            <p className="mt-2 text-2xl font-bold text-purple-500">{stats.expiringSoon}</p>
            <span className="text-xs text-muted-foreground">{t('stats.requiringAttentionDesc')}</span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: STOCK CATALOG
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'catalog' && (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
          {/* Filters Bar & View Mode Switcher */}
          <div className="p-4 border-b border-border flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t('filters.searchPlaceholder')}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 text-foreground"
                />
              </div>

              {/* View Switcher: Location (Shelf vs Back Store) vs Standard (Multi-Location Mode Only) */}
              {inventoryMode === 'multi_location' ? (
                <div className="flex items-center gap-1.5 p-1 bg-background border border-border rounded-xl">
                  <button
                    onClick={() => setCatalogViewMode('location')}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                      catalogViewMode === 'location'
                        ? "bg-brand-500 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-surface"
                    )}
                  >
                    <Boxes size={14} />
                    <span>{t('views.shelfVsBackStore')}</span>
                  </button>
                  <button
                    onClick={() => setCatalogViewMode('standard')}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                      catalogViewMode === 'standard'
                        ? "bg-brand-500 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-surface"
                    )}
                  >
                    <FileText size={14} />
                    <span>{t('views.catalogValuation')}</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background border border-border text-xs text-muted-foreground">
                  <Store size={14} className="text-emerald-500" />
                  <span className="font-medium">
                    {isAr ? 'النمط البسيط: مخزون الرف المباشر' : 'Simple Mode: Direct Shelf Stock'}
                  </span>
                </div>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(inventoryMode === 'multi_location' 
                ? (['all', 'in_stock', 'low', 'out', 'expiring', 'refill'] as const)
                : (['all', 'in_stock', 'low', 'out', 'expiring'] as const)
              ).map(f => {
                const labelMap: Record<string, string> = {
                  all: t('filters.allStock'),
                  in_stock: t('filters.inStock'),
                  low: t('filters.low'),
                  out: t('filters.out'),
                  expiring: t('filters.expiring'),
                  refill: t('filters.needsShelfRefill'),
                };
                return (
                  <button
                    key={f}
                    onClick={() => setStockFilter(f as any)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5",
                      stockFilter === f
                        ? "bg-brand-500 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground bg-background hover:bg-surface border border-border"
                    )}
                  >
                    <span>{labelMap[f]}</span>
                    {f === 'refill' && refillCount > 0 && (
                      <span className={cn(
                        "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                        stockFilter === 'refill' ? "bg-white text-brand-600" : "bg-amber-500 text-white"
                      )}>
                        {refillCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {inventoryMode === 'multi_location' && catalogViewMode === 'location' ? (
              /* ── 1. EXACT SHELF VS BACK STORE LOCATION TABLE ── */
              <table className="w-full text-left rtl:text-right text-sm whitespace-nowrap">
                <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-left rtl:text-right">{t('table.medicineName')}</th>
                    <th className="px-6 py-4 font-semibold text-center">{t('table.shelfStock')}</th>
                    <th className="px-6 py-4 font-semibold text-center">{t('table.backStoreStock')}</th>
                    <th className="px-6 py-4 font-semibold text-center">{t('table.totalBranch')}</th>
                    <th className="px-6 py-4 font-semibold text-center">{t('table.shelfStatus')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('table.action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">{t('table.loadingBalances')}</td></tr>
                  ) : filteredItems.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">{t('table.noMatchingFilter')}</td></tr>
                  ) : (
                    filteredItems.map(item => {
                      const med = item.medicine;
                      const loc = locationMap[med.id];
                      const shelfStock = loc?.shelf_stock ?? 0;
                      const whStock = loc?.warehouse_stock ?? 0;
                      const totalStock = shelfStock + whStock;
                      const reorder = med?.reorder_level || 10;
                      const unit = formatUnit(med.base_unit || 'packs');

                      let statusBadge;
                      if (totalStock === 0) {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-500 border border-gray-500/20">
                            {t('table.outOfStockOrder')}
                          </span>
                        );
                      } else if (shelfStock === 0 && whStock > 0) {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 animate-pulse">
                            {t('table.refillNeeded')}
                          </span>
                        );
                      } else if (shelfStock <= reorder && whStock > 0) {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            {t('table.lowOnShelf')}
                          </span>
                        );
                      } else {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {t('table.normal')}
                          </span>
                        );
                      }

                      return (
                        <tr key={med.id} className="hover:bg-background/50 transition-colors">
                          <td className="px-6 py-4">
                            <button
                              onClick={() => router.push(`/catalog/products/${med.id}`)}
                              className="font-medium text-foreground hover:text-brand-500 text-left rtl:text-right transition-colors flex flex-col"
                            >
                              <span className="font-semibold text-foreground text-sm">{med.name_en}</span>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                {med.generic_name && <span>{med.generic_name}</span>}
                                {med.sku && <span className="font-mono text-[11px] bg-background/80 px-1 rounded border border-border">{med.sku}</span>}
                              </div>
                            </button>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {shelfStock > reorder ? (
                              <span className="inline-flex items-center gap-1.5 font-bold text-sm text-emerald-600 dark:text-emerald-400">
                                🟢 {shelfStock} {unit}
                              </span>
                            ) : shelfStock > 0 ? (
                              <span className="inline-flex items-center gap-1.5 font-bold text-sm text-amber-600 dark:text-amber-400">
                                🟡 {shelfStock} {unit}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 font-bold text-sm text-rose-600 dark:text-rose-400">
                                🔴 0 {unit}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {whStock > 0 ? (
                              <span className="inline-flex items-center gap-1.5 font-semibold text-sm text-blue-600 dark:text-blue-400">
                                📦 {whStock} {unit}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground/60">
                                ⚪ 0 {unit}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-bold text-foreground text-sm">
                              {totalStock} {unit}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {statusBadge}
                          </td>
                          <td className="px-6 py-4 text-right rtl:text-left">
                            <div className="flex items-center justify-end rtl:justify-start gap-1.5">
                              {/* Move to Store (Surplus Shelf -> Back Store) */}
                              {shelfStock > 0 && (
                                <button
                                  onClick={() => setMoveToStoreItem({
                                    medicine: med,
                                    shelfStock,
                                    whStock,
                                    unit,
                                  })}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 transition-all active:scale-95 shadow-sm"
                                  title={isAr ? "نقل الفائض إلى المستودع 📦" : "Move to Back Store 📦"}
                                >
                                  <Archive size={12} />
                                  <span>{t('table.toStoreBtn')}</span>
                                </button>
                              )}

                              {/* Refill Shelf (Back Store -> Shelf) */}
                              {whStock > 0 && (
                                <button
                                  onClick={() => setActiveTab('refill')}
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95",
                                    shelfStock <= reorder
                                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                                      : "bg-surface hover:bg-surface-hover text-foreground border border-border"
                                  )}
                                  title={isAr ? "تعبئة الرف من المستودع ↻" : "Refill Shelf from Back Store ↻"}
                                >
                                  <RefreshCw size={12} />
                                  <span>{t('table.refillBtn')}</span>
                                </button>
                              )}

                              {/* Stock Audit / Adjust */}
                              <button
                                onClick={() => {
                                  onAdjustMedicineChange(med.id);
                                  setAdjustOpen(true);
                                }}
                                className="px-2 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                                title={isAr ? "جرد وتعديل" : "Audit / Adjust"}
                              >
                                {t('table.adjustBtn')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              /* ── 2. STANDARD CATALOG & VALUATION TABLE ── */
              <table className="w-full text-left rtl:text-right text-sm whitespace-nowrap">
                <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-left rtl:text-right">{t('table.medicineName')}</th>
                    <th className="px-6 py-4 font-semibold hidden md:table-cell">SKU / Barcode</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('table.availableQty')}</th>
                    <th className="px-6 py-4 font-semibold text-center hidden lg:table-cell">{t('table.nearestExpiry')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left hidden sm:table-cell">{t('table.price')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('table.valuation')}</th>
                    <th className="px-6 py-4 font-semibold text-center">{t('table.status')}</th>
                    <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('table.action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">{t('table.loadingStock')}</td></tr>
                  ) : filteredItems.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">{t('table.noStockItems')}</td></tr>
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
                              className="font-medium text-foreground hover:text-brand-500 text-left rtl:text-right transition-colors flex flex-col"
                            >
                              <span>{med.name_en}</span>
                              {med.generic_name && <span className="text-xs text-muted-foreground font-normal">{med.generic_name}</span>}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground font-mono text-xs hidden md:table-cell">
                            {med.sku || med.barcode || '-'}
                          </td>
                          <td className="px-6 py-4 text-right rtl:text-left">
                            <span className={cn(
                              "font-bold text-base",
                              qty === 0 ? "text-rose-500" : qty <= reorder ? "text-amber-500" : "text-emerald-500"
                            )}>
                              {qty}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1.5 rtl:mr-1.5">{formatUnit(med.base_unit)}</span>
                          </td>
                          <td className="px-6 py-4 text-center hidden lg:table-cell text-xs font-medium">
                            {days !== null ? (
                              <span className={cn(
                                days <= 0 ? "text-rose-600 font-bold" : days <= 30 ? "text-rose-500 font-semibold" : days <= 90 ? "text-amber-500" : "text-muted-foreground"
                              )}>
                                {days <= 0 ? t('table.expired') : t('table.daysLeft', { days })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right rtl:text-left text-muted-foreground hidden sm:table-cell">
                            {currency} {Number(med.selling_price || 0).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-right rtl:text-left font-bold text-foreground">
                            {currency} {val.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {qty === 0 ? (
                              <Badge variant="danger">{t('stats.outOfStock')}</Badge>
                            ) : qty <= reorder ? (
                              <Badge variant="warning">{t('stats.lowStock')}</Badge>
                            ) : (
                              <Badge variant="success">{t('filters.inStock')}</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right rtl:text-left">
                            <button
                              onClick={() => {
                                onAdjustMedicineChange(med.id);
                                setAdjustOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border hover:bg-background text-foreground transition-colors"
                            >
                              {t('table.adjustBtn')}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
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
              <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('ledger.searchPlaceholder')}
                value={ledgerSearch}
                onChange={e => setLedgerSearch(e.target.value)}
                className="w-full pl-9 pr-4 rtl:pl-4 rtl:pr-9 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 text-foreground"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-background border border-border rounded-xl">
              {[
                { id: 'ALL', label: t('ledger.allTransactions') },
                { id: 'PURCHASE_RECEIPT', label: t('ledger.purchases') },
                { id: 'SALE_OUT', label: t('ledger.sales') },
                { id: 'SALE_RETURN', label: t('ledger.returns') },
                { id: 'ADJUSTMENT_IN', label: t('ledger.adjustIn') },
                { id: 'ADJUSTMENT_OUT', label: t('ledger.adjustOut') },
                { id: 'ADJUSTMENT_DAMAGE', label: t('ledger.damage') },
                { id: 'ADJUSTMENT_EXPIRED', label: t('ledger.expired') },
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
            <table className="w-full text-left rtl:text-right text-sm whitespace-nowrap">
              <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold text-left rtl:text-right">{t('ledger.dateTime')}</th>
                  <th className="px-6 py-4 font-semibold text-left rtl:text-right">{t('ledger.type')}</th>
                  <th className="px-6 py-4 font-semibold text-left rtl:text-right">{t('ledger.medicine')}</th>
                  <th className="px-6 py-4 font-semibold hidden md:table-cell text-left rtl:text-right">{t('ledger.batch')}</th>
                  <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('ledger.qty')}</th>
                  <th className="px-6 py-4 font-semibold text-right rtl:text-left hidden sm:table-cell">{t('ledger.unitCost')}</th>
                  <th className="px-6 py-4 font-semibold text-right rtl:text-left">{t('ledger.value')}</th>
                  <th className="px-6 py-4 font-semibold hidden md:table-cell text-left rtl:text-right">{t('ledger.reference')}</th>
                  <th className="px-6 py-4 font-semibold hidden lg:table-cell text-left rtl:text-right">{t('ledger.auditNotes')}</th>
                  <th className="px-6 py-4 font-semibold hidden xl:table-cell text-left rtl:text-right">{t('ledger.performedBy')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingMovements ? (
                  <tr><td colSpan={10} className="px-6 py-12 text-center text-muted-foreground">{t('ledger.loading')}</td></tr>
                ) : filteredMovements.length === 0 ? (
                  <tr><td colSpan={10} className="px-6 py-12 text-center text-muted-foreground">{t('ledger.noMovements')}</td></tr>
                ) : (
                  filteredMovements.map(m => {
                    const qty = Number(m.quantity);
                    const isPositive = qty > 0;
                    const unitCost = Number(m.unit_cost || 0);
                    const totalCost = Number(m.total_cost || Math.abs(qty) * unitCost);

                    let typeLabel = m.movement_type.replace('ADJUSTMENT_', '');
                    if (m.movement_type === 'PURCHASE_RECEIPT') typeLabel = t('ledger.purchases');
                    else if (m.movement_type === 'SALE_OUT') typeLabel = t('ledger.sales');
                    else if (m.movement_type === 'SALE_RETURN') typeLabel = t('ledger.returns');
                    else if (m.movement_type === 'ADJUSTMENT_IN') typeLabel = t('ledger.adjustIn');
                    else if (m.movement_type === 'ADJUSTMENT_OUT') typeLabel = t('ledger.adjustOut');
                    else if (m.movement_type === 'ADJUSTMENT_DAMAGE') typeLabel = t('ledger.damage');
                    else if (m.movement_type === 'ADJUSTMENT_EXPIRED') typeLabel = t('ledger.expired');

                    return (
                      <tr key={m.id} className="hover:bg-background/50 transition-colors">
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          {formatDateTime(m.created_at, locale)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1",
                            isPositive
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          )}>
                            {isPositive ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />}
                            {typeLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-foreground">
                          {m.medicine_name || 'Medicine'}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-muted-foreground hidden md:table-cell">
                          {m.batch_number || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-right rtl:text-left font-extrabold text-base">
                          <span className={isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                            {isPositive ? '+' : ''}{qty}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right rtl:text-left text-muted-foreground text-xs hidden sm:table-cell">
                          {currency} {unitCost.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right rtl:text-left font-bold text-foreground">
                          {currency} {totalCost.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono font-semibold text-brand-400 hidden md:table-cell">
                          {m.reference_id ? (
                            <span className="bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
                              {m.reference_type ? `${m.reference_type}: ` : ''}{m.reference_id}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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
          TAB 4: SHELF REFILL WORKSPACE (ISSUES: WAREHOUSE -> SHELF)
          ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'refill' && (
        <ShelfRefillCenter
          onRefillComplete={() => {
            fetchData();
            fetchRefillCount();
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SLIDE-OVER: Add New Batch (Stock Intake)
          ═══════════════════════════════════════════════════════════════════ */}
      <SlideOver
        open={addStockOpen}
        onClose={() => setAddStockOpen(false)}
        title={t('addModal.title')}
        footer={
          <div className="flex justify-end rtl:justify-start gap-3">
            <button onClick={() => setAddStockOpen(false)} className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors">
              {t('addModal.cancel')}
            </button>
            <button
              onClick={handleAddStock}
              disabled={isSaving}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {isSaving ? t('addModal.saving') : t('addModal.confirmIntake')}
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">{t('addModal.medicine')}</label>
            <Select
              value={addForm.medicine_id}
              onChange={v => setAddForm({ ...addForm, medicine_id: v })}
              options={medicines.map(m => ({ value: m.id, label: `${m.name_en}${m.strength ? ` (${m.strength})` : ''}` }))}
              placeholder={t('addModal.selectMedicine')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{t('addModal.quantityReceived')}</label>
              <input
                type="number" min="1"
                value={addForm.quantity}
                onChange={e => setAddForm({ ...addForm, quantity: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
                placeholder="100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{t('addModal.purchasePrice', { currency })}</label>
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
            <label className="text-sm font-medium text-muted-foreground">{t('addModal.batchNumber')}</label>
            <input
              type="text"
              value={addForm.batch_number}
              onChange={e => setAddForm({ ...addForm, batch_number: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-brand-500 focus:outline-none"
              placeholder={t('addModal.batchPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">{t('addModal.supplier')}</label>
            <Select
              value={addForm.supplier_id}
              onChange={v => setAddForm({ ...addForm, supplier_id: v })}
              options={suppliers.map(s => ({ value: s.id, label: s.name }))}
              placeholder={t('addModal.selectSupplier')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{t('addModal.productionDate')}</label>
              <input
                type="date"
                value={addForm.production_date}
                onChange={e => setAddForm({ ...addForm, production_date: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">{t('addModal.expiryDate')}</label>
              <input
                type="date"
                value={addForm.expiry_date}
                onChange={e => setAddForm({ ...addForm, expiry_date: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Target Location (Multi-Location Mode only) */}
          {inventoryMode === 'multi_location' && (
            <div className="space-y-2 pt-2 border-t border-border/60">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                {isAr ? 'وجهة استلام وتخزين الدفعة' : 'Intake Destination Location'}
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-background rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setAddForm({ ...addForm, target_location: 'shelf' })}
                  className={cn(
                    "py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                    addForm.target_location !== 'warehouse'
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span>🟢 {isAr ? 'رف الصرف المباشر' : 'Front Shelf'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddForm({ ...addForm, target_location: 'warehouse' })}
                  className={cn(
                    "py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                    addForm.target_location === 'warehouse'
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span>📦 {isAr ? 'المستودع الخلفي' : 'Back Store'}</span>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {addForm.target_location === 'warehouse'
                  ? (isAr ? 'سيتم حفظ الرصيد في المستودع الخلفي لطلب تعبئته لاحقاً.' : 'Batch will be deposited directly into back store reserves.')
                  : (isAr ? 'سيتم إتاحة الرصيد فوراً على الرف الأمامي للصرف والبيع.' : 'Batch will be placed directly onto front dispensary shelf.')}
              </p>
            </div>
          )}
        </div>
      </SlideOver>

      {/* ═══════════════════════════════════════════════════════════════════
          SLIDE-OVER: Stock Adjustment (Strict Controlled Audit)
          ═══════════════════════════════════════════════════════════════════ */}
      <SlideOver
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title={t('adjustModal.title')}
        footer={
          <div className="flex justify-end rtl:justify-start gap-3">
            <button onClick={() => setAdjustOpen(false)} className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors">
              {t('adjustModal.cancel')}
            </button>
            <button
              onClick={handleAdjustStock}
              disabled={isSaving || !adjustmentCalc.valid}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-orange-600 px-5 text-sm font-bold text-white transition-all hover:bg-orange-700 disabled:opacity-50 shadow-md shadow-orange-600/20"
            >
              {isSaving ? t('adjustModal.recordingAudit') : t('adjustModal.commitAdjustment')}
            </button>
          </div>
        }
      >
        <div className="space-y-5 pb-6">
          <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-600 dark:text-orange-400">
            <span className="font-bold block mb-1">{t('adjustModal.noticeTitle')}</span>
            {t('adjustModal.noticeDesc')}
          </div>

          {/* Mode Switcher */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
              {t('adjustModal.adjustmentMethod')}
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
                {t('adjustModal.physicalCount')}
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
                {t('adjustModal.manualDelta')}
              </button>
            </div>
          </div>

          {/* Medicine Select */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">{t('adjustModal.medicine')}</label>
            <Select
              value={adjustForm.medicine_id}
              onChange={onAdjustMedicineChange}
              options={medicines.map(m => ({ value: m.id, label: `${m.name_en}${m.strength ? ` (${m.strength})` : ''}` }))}
              placeholder={t('adjustModal.selectMedicine')}
            />
          </div>

          {/* Batch Select */}
          {adjustForm.medicine_id && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">{t('adjustModal.batch')}</label>
              {adjustBatches.length === 0 ? (
                <p className="text-xs text-rose-500 italic py-1">{t('adjustModal.noBatches')}</p>
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
                    label: `${b.batch_number} — Qty: ${Number(b.quantity_remaining)} — Exp: ${new Date(b.expiry_date).toLocaleDateString(locale === 'ar' ? 'ar-SD' : 'en-GB', { month: 'short', year: 'numeric' })}`
                  }))}
                  placeholder={t('adjustModal.selectBatch')}
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
                    {t('adjustModal.actualCount')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={adjustForm.new_quantity}
                    onChange={e => setAdjustForm({ ...adjustForm, new_quantity: e.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-base font-bold text-foreground focus:border-brand-500 focus:outline-none"
                    placeholder={t('adjustModal.countPlaceholder')}
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
                      <ArrowDownCircle size={15} /> {t('adjustModal.addStock')}
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
                      <ArrowUpCircle size={15} /> {t('adjustModal.removeStock')}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                      {adjustForm.adjustment_type === 'IN' ? t('adjustModal.qtyToAdd') : t('adjustModal.qtyToDeduct')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={adjustForm.quantity}
                      onChange={e => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-base font-bold text-foreground focus:border-brand-500 focus:outline-none"
                      placeholder="10"
                    />
                  </div>
                </div>
              )}

              {/* Live Preview Card */}
              <div className="p-4 rounded-xl bg-background border border-border space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  {t('adjustModal.reconciliationPreview')}
                </span>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{t('adjustModal.currentStock')}</span>
                  <span className="font-bold text-foreground">{Number(selectedAdjustBatch.quantity_remaining)} {t('adjustModal.units')}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{t('adjustModal.netAdjustment')}</span>
                  <span className={cn("font-bold text-sm", adjustmentCalc.delta > 0 ? "text-emerald-500" : adjustmentCalc.delta < 0 ? "text-rose-500" : "text-muted-foreground")}>
                    {adjustmentCalc.delta > 0 ? '+' : ''}{adjustmentCalc.delta} {t('adjustModal.units')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-border/80">
                  <span className="font-semibold text-foreground">{t('adjustModal.newStock')}</span>
                  <span className="font-extrabold text-brand-400 text-sm">{adjustmentCalc.newStock} {t('adjustModal.units')}</span>
                </div>
              </div>

              {/* Reason Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  {t('adjustModal.reasonCategory')}
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'CORRECTION', label: t('adjustModal.reasons.correction') },
                    { id: 'DAMAGE', label: t('adjustModal.reasons.damage') },
                    { id: 'EXPIRED', label: t('adjustModal.reasons.expired') },
                    { id: 'THEFT_LOSS', label: t('adjustModal.reasons.theftLoss') },
                    { id: 'INTERNAL_USE', label: t('adjustModal.reasons.internalUse') },
                  ].map(r => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => setAdjustForm({ ...adjustForm, adjustment_type: r.id })}
                      className={cn(
                        "p-2 rounded-lg border text-left rtl:text-right font-medium transition-colors",
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
                  {t('adjustModal.detailedExplanation')}
                </label>
                <textarea
                  rows={2}
                  value={adjustForm.reason}
                  onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none resize-none"
                  placeholder={t('adjustModal.explanationPlaceholder')}
                />
              </div>
            </>
          )}
        </div>
      </SlideOver>

      {/* ── Inventory Operating Mode Settings Modal ──────────────────────── */}
      <InventorySettingsModal
        open={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        onModeChanged={() => {
          fetchData();
          fetchRefillCount();
        }}
      />

      {/* ── Move To Store Modal ────────────────────────────────────────── */}
      <MoveToStoreModal
        open={!!moveToStoreItem}
        onClose={() => setMoveToStoreItem(null)}
        medicine={moveToStoreItem?.medicine || null}
        currentShelfStock={moveToStoreItem?.shelfStock || 0}
        currentWarehouseStock={moveToStoreItem?.whStock || 0}
        unit={moveToStoreItem?.unit || 'units'}
        onSuccess={() => {
          fetchData();
          fetchRefillCount();
        }}
      />
    </div>
  );
}