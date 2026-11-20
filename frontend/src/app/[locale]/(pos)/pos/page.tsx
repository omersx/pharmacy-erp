'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePosStore } from '@/store/pos-store';
import { useAppStore } from '@/store/app-store';
import { formatMoney } from '@/lib/utils';
import { api } from '@/lib/api';
import CartPanel from '@/components/pos/CartPanel';
import ProductCatalog from '@/components/pos/ProductCatalog';
import PaymentModal from '@/components/pos/PaymentModal';
import PaymentSettingsModal from '@/components/pos/PaymentSettingsModal';
import { CashSessionGuard } from '@/components/pos/CashSessionGuard';
import { CloseSessionModal } from '@/components/pos/CloseSessionModal';
import { CashMovementModal } from '@/components/pos/CashMovementModal';
import { SaleReceipt } from '@/components/pos/SaleReceipt';
import { BarcodeScanner } from '@/components/ui/barcode-scanner';
import { useScanFeedback } from '@/components/ui/scan-feedback';
import { useBarcodeScanner, type BarcodeKeyDebug } from '@/hooks/use-barcode-scanner';
import { ScannerDiagnosticsModal } from '@/components/pos/ScannerDiagnosticsModal';
import { TerminalDiagnosticsModal } from '@/components/pwa';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { CatalogStaleBanner } from '@/components/pos/CatalogStaleBanner';
import { LockScreen } from '@/components/pos/LockScreen';
import { SetPinModal } from '@/components/pos/SetPinModal';
import { useIdleLock } from '@/hooks/use-idle-lock';
import { db } from '@/lib/offline/db';
import { syncCatalog } from '@/lib/offline/catalog-sync';
import { initAutoSync } from '@/lib/offline/sync';
import type { Product } from '@/components/pos/ProductCatalog';
import {
  Menu,
  Search,
  ScanBarcode,
  Camera,
  ChevronDown,
  User,
  X,
  Store,
  Sun,
  Moon,
  LogOut,
  Calculator,
  ArrowDownCircle,
  Lock,
  KeyRound,
  Activity,
} from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import toast from 'react-hot-toast';

export default function PosPage() {
  return (
    <CashSessionGuard>
      {(session, openRegisterModal, onSessionClosed) => (
        <PosContent
          session={session}
          onOpenRegister={openRegisterModal}
          onSessionClosed={onSessionClosed}
        />
      )}
    </CashSessionGuard>
  );
}

function PosContent({
  session,
  onOpenRegister,
  onSessionClosed,
}: {
  session: { id: string; session_code?: string; opening_amount: number; opened_at: string };
  onOpenRegister: () => void;
  onSessionClosed: () => void;
}) {
  const [search, setSearch] = useState('');
  const [paymentMode, setPaymentMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [closeSessionOpen, setCloseSessionOpen] = useState(false);
  const [cashMovementOpen, setCashMovementOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [terminalDiagnosticsOpen, setTerminalDiagnosticsOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);

  // Terminal screen auto-lock (5 min inactivity)
  const { isLocked, lock, unlock } = useIdleLock({
    timeoutMinutes: 5,
    lockOnVisibilityHidden: false,
    enabled: true,
  });

  // Screen wake lock (silently keeps display active without visual clutter)
  useWakeLock({ autoRequest: true });
  const [mobileTab, setMobileTab] = useState<'cart' | 'products'>('products');
  
  // Receipt State
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [saleReceiptData, setSaleReceiptData] = useState<any>(null);

  // Camera Scanner State
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);

  // Hardware Scanner State & Diagnostics
  const [isScanning, setIsScanning] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [lastDebugEvent, setLastDebugEvent] = useState<BarcodeKeyDebug | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const inputScanTimerRef = useRef<NodeJS.Timeout | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { currency, theme, setTheme } = useAppStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [isLoading, setIsLoading] = useState(true);

  // Fast initial render from IndexedDB cache (Stale-While-Revalidate)
  useEffect(() => {
    let active = true;
    const loadCachedProducts = async () => {
      try {
        const cachedMeds = await db.medicines.toArray();
        if (active && cachedMeds.length > 0) {
          const cachedProducts: Product[] = cachedMeds.map((m) => ({
            id: m.id,
            medicine_id: m.id,
            name: m.nameEn || m.nameAr || 'Unknown',
            category: 'All',
            price: Number(m.price) || 0,
            stock: 999,
            batch: '-',
            lot_number: '-',
            expiry: '-',
            requires_prescription: m.requiresRx || false,
            favorite: false,
            barcode: m.barcode || '',
            sku: m.id,
          }));
          setProducts((current) => (current.length === 0 ? cachedProducts : current));
          setIsLoading(false);
        }
      } catch (err) {
        // Cache read error fallback
      }
    };
    loadCachedProducts();
    return () => {
      active = false;
    };
  }, []);

  const fetchPosData = useCallback(async () => {
    try {
      // Only show skeleton loader if no products have been loaded yet
      setProducts((current) => {
        if (current.length === 0) setIsLoading(true);
        return current;
      });

      const [medicines, stockItems, categoriesTree, locationStocks]: [any, any, any, any] = await Promise.all([
        api.getMedicines().catch(() => []),
        api.getStock().catch(() => []),
        api.getCategoryTree().catch(() => []),
        api.getLocationStockSummary().catch(() => []),
      ]);
      
      const catMap = new Map<string, string>();
      const addCats = (nodes: any[]) => {
        nodes.forEach((node: any) => {
          catMap.set(node.id, node.name_en);
          if (node.children) addCats(node.children);
        });
      };
      if (Array.isArray(categoriesTree)) {
        addCats(categoriesTree);
      }
      
      const stockMap = new Map<string, number>();
      if (Array.isArray(stockItems)) {
        stockItems.forEach((item: any) => {
          if (item?.medicine?.id) {
            stockMap.set(item.medicine.id, item.total_quantity);
          }
        });
      }

      const locMap = new Map<string, { shelf: number; warehouse: number }>();
      if (Array.isArray(locationStocks)) {
        locationStocks.forEach((item: any) => {
          if (item?.medicine_id) {
            locMap.set(item.medicine_id, {
              shelf: Number(item.shelf_stock || 0),
              warehouse: Number(item.warehouse_stock || 0)
            });
          }
        });
      }
      
      const medList = Array.isArray(medicines) ? medicines : [];
      const realProducts: Product[] = medList.map((med: any) => {
        const loc = locMap.get(med.id);
        return {
          id: med.id,
          medicine_id: med.id,
          name: med.name_en || med.name || 'Unknown',
          category: med.category_id ? (catMap.get(med.category_id) || 'Other') : 'Other',
          price: Number(med.selling_price) || 0,
          stock: stockMap.get(med.id) || 0,
          shelf_stock: loc ? loc.shelf : undefined,
          warehouse_stock: loc ? loc.warehouse : undefined,
          batch: '-',
          lot_number: '-',
          expiry: '-',
          requires_prescription: med.requires_prescription || false,
          favorite: false,
          barcode: med.barcode || '',
          sku: med.sku || ''
        };
      });
      
      const catSet = new Set<string>(['All']);
      realProducts.forEach(p => catSet.add(p.category));
      
      if (realProducts.length > 0) {
        setProducts(realProducts);
        setCategories(Array.from(catSet));
        // Keep local offline DB in sync
        syncCatalog((session as any)?.branch_id).catch(() => {});
      } else {
        // Fallback to offline catalog from IndexedDB
        const offlineMeds = await db.medicines.toArray();
        if (offlineMeds.length > 0) {
          const offlineProducts: Product[] = offlineMeds.map((m) => ({
            id: m.id,
            medicine_id: m.id,
            name: m.nameEn || m.nameAr || 'Unknown',
            category: 'Offline Catalog',
            price: Number(m.price) || 0,
            stock: 999,
            batch: '-',
            lot_number: '-',
            expiry: '-',
            requires_prescription: m.requiresRx || false,
            favorite: false,
            barcode: m.barcode || '',
            sku: m.id,
          }));
          setProducts(offlineProducts);
          setCategories(['All', 'Offline Catalog']);
        } else {
          setProducts([]);
          setCategories(['All']);
        }
      }
    } catch (error) {
      console.error('Failed to fetch POS data, attempting offline fallback', error);
      try {
        const offlineMeds = await db.medicines.toArray();
        if (offlineMeds.length > 0) {
          const offlineProducts: Product[] = offlineMeds.map((m) => ({
            id: m.id,
            medicine_id: m.id,
            name: m.nameEn || m.nameAr || 'Unknown',
            category: 'Offline Catalog',
            price: Number(m.price) || 0,
            stock: 999,
            batch: '-',
            lot_number: '-',
            expiry: '-',
            requires_prescription: m.requiresRx || false,
            favorite: false,
            barcode: m.barcode || '',
            sku: m.id,
          }));
          setProducts(offlineProducts);
          setCategories(['All', 'Offline Catalog']);
          return;
        }
      } catch {}
      setProducts([]);
      setCategories(['All']);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchPosData();
  }, [fetchPosData]);

  // Auto-focus barcode search on load
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  // Background auto-sync for offline sales
  useEffect(() => {
    const cleanup = initAutoSync();
    return () => cleanup();
  }, []);

  // Store
  const addItem = usePosStore((s) => s.addItem);
  const cart = usePosStore((s) => s.cart);
  const total = usePosStore((s) => s.total);

  // Search filtering
  const searchResults =
    search.length > 1
      ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
      : [];

  // Product click handler
  const handleProductClick = useCallback(
    (product: Product) => {
      if (product.stock <= 0) {
        toast.error(`${product.name} is out of stock`);
        return;
      }
      addItem({
        medicine_id: product.medicine_id,
        name: product.name,
        batch: product.batch,
        lot_number: product.lot_number,
        quantity: 1,
        unit_price: product.price,
      });
      setSearch('');
      setShowDropdown(false);
    },
    [addItem]
  );

  // Scan feedback (beep sounds + visual flash)
  const { playSuccess, playError, flashElement } = useScanFeedback();

  // Shared barcode scan handler (used by USB/Bluetooth scanner, manual search Enter, and camera scanner)
  const handleBarcodeScan = useCallback(
    async (scannedCode: string) => {
      const code = scannedCode.trim();
      if (!code) return;

      // Prevent duplicate scan triggers within 400ms
      const now = Date.now();
      if (lastScanRef.current.code === code && now - lastScanRef.current.time < 400) {
        return;
      }
      lastScanRef.current = { code, time: now };

      setIsScanning(true);

      try {
        // 1. Unified Barcode Lookup (Primary, Alternate, Packaging, Batch)
        const scanRes: any = await api.scanBarcode(code, (session as any)?.branch_id);

        if (scanRes && scanRes.medicine_id) {
          // Sellability check (strictly blocks expired, quarantined, or recalled batches)
          if (!scanRes.is_sellable) {
            playError();
            flashElement('red', searchInputRef.current);
            toast.error(
              (t) => (
                <div className="flex flex-col gap-0.5 text-left">
                  <span className="font-semibold text-sm">⚠️ Cannot Sell Product</span>
                  <span className="text-xs text-muted-foreground">
                    {scanRes.sellable_status_reason || `${scanRes.medicine_name} is not available for sale.`}
                  </span>
                </div>
              ),
              { id: `sell-error-${code}` }
            );
            setSearch('');
            setShowDropdown(false);
            searchInputRef.current?.focus();
            return;
          }

          const qtyToAdd = scanRes.units_multiplier || 1;
          const displayName =
            scanRes.match_type === 'PACKAGING' && scanRes.packaging_type
              ? `${scanRes.medicine_name} (${scanRes.packaging_type} x${qtyToAdd})`
              : scanRes.medicine_name;

          const resolvedPrice = Number(
            scanRes.effective_price ?? 
            scanRes.selling_price ?? 
            scanRes.unit_price ?? 
            0
          );

          addItem({
            medicine_id: scanRes.medicine_id,
            name: displayName,
            batch: scanRes.batch_number || '-',
            lot_number: scanRes.batch_number || '-',
            quantity: qtyToAdd,
            unit_price: resolvedPrice,
          });

          playSuccess();
          flashElement('green', searchInputRef.current);

          let successMsg = `✅ ${scanRes.medicine_name}`;
          if (scanRes.match_type === 'PACKAGING') {
            successMsg += ` (${scanRes.packaging_type} x${qtyToAdd})`;
          } else if (scanRes.match_type === 'BATCH' && scanRes.batch_number) {
            successMsg += ` [Batch: ${scanRes.batch_number}]`;
          }
          toast.success(successMsg, { id: `scan-success-${code}` });
          setSearch('');
          setShowDropdown(false);
          searchInputRef.current?.focus();
          return;
        }
      } catch (scanErr: any) {
        // Fall through to local fallback lookup if scan resolution threw
      } finally {
        setIsScanning(false);
      }

      // 2. Fallback: Local search by product ID, barcode (exact/suffix), SKU, or exact name
      const clean = code.toLowerCase();
      const found = products.find(
        (p: any) => {
          const pBar = (p.barcode || '').toLowerCase();
          const pSku = (p.sku || '').toLowerCase();
          const pName = (p.name || '').toLowerCase();
          return (
            p.id === code ||
            pBar === clean ||
            (clean.length >= 6 && pBar.endsWith(clean)) ||
            (pBar.length >= 6 && clean.endsWith(pBar)) ||
            pSku === clean ||
            (clean.length >= 6 && pSku.endsWith(clean)) ||
            pName === clean
          );
        }
      );

      if (found) {
        handleProductClick(found);
        playSuccess();
        flashElement('green', searchInputRef.current);
        toast.success(`✅ Scanned: ${found.name}`, { id: `scan-success-${code}` });
        setSearch('');
        setShowDropdown(false);
        searchInputRef.current?.focus();
        return;
      }

      // 2b. Fallback: Lookup in Dexie IndexedDB offline catalog
      try {
        const offlineMatch =
          (await db.medicines.where('barcode').equals(code).first()) ||
          (await db.medicines.get(code));

        if (offlineMatch) {
          addItem({
            medicine_id: offlineMatch.id,
            name: offlineMatch.nameEn || offlineMatch.nameAr,
            batch: '-',
            lot_number: '-',
            quantity: 1,
            unit_price: Number(offlineMatch.price) || 0,
          });
          playSuccess();
          flashElement('green', searchInputRef.current);
          toast.success(`✅ Scanned (Offline): ${offlineMatch.nameEn || offlineMatch.nameAr}`, {
            id: `scan-success-${code}`,
          });
          setSearch('');
          setShowDropdown(false);
          searchInputRef.current?.focus();
          return;
        }
      } catch (offlineErr) {
        console.warn('Offline barcode lookup error', offlineErr);
      }

      // 3. Clear Invalid Barcode Feedback
      playError();
      flashElement('red', searchInputRef.current);
      toast.error(
        (t) => (
          <div className="flex flex-col gap-1 text-left">
            <span className="font-bold text-sm text-red-500 flex items-center gap-1.5">
              <span>❌ Invalid Barcode</span>
            </span>
            <span className="text-xs text-foreground/80">
              No product or batch found matching barcode:
            </span>
            <span className="font-mono font-bold text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 rounded border border-red-500/20 inline-block w-fit">
              {code}
            </span>
          </div>
        ),
        { duration: 4500, id: `barcode-invalid-${code}` }
      );
      setSearch('');
      setShowDropdown(false);
      searchInputRef.current?.focus();
    },
    [session, products, handleProductClick, addItem, playSuccess, playError, flashElement]
  );

  // USB/Bluetooth hardware barcode scanner hook
  useBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: !paymentMode && !cameraScannerOpen,
    onKeyDebug: setLastDebugEvent,
  });

  // Camera scanner callback
  const handleCameraScan = useCallback(
    (code: string) => {
      setCameraScannerOpen(false);
      handleBarcodeScan(code);
    },
    [handleBarcodeScan]
  );

  // Keyboard shortcuts (F2 = search, F4 = camera, F9 = payment, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'F4') {
        e.preventDefault();
        setCameraScannerOpen(true);
      }
      if (e.key === 'F9' && cart.length > 0) {
        e.preventDefault();
        setPaymentMode(true);
      }
      if (e.key === 'Escape') {
        if (cameraScannerOpen) setCameraScannerOpen(false);
        if (paymentMode) setPaymentMode(false);
        if (showDropdown) setShowDropdown(false);
        if (userMenuOpen) setUserMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.length, paymentMode, showDropdown, userMenuOpen, cameraScannerOpen]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* ===== HEADER ===== */}
      <header className="h-[60px] bg-background border-b border-border flex items-center justify-between px-2 md:px-4 z-10 shrink-0 gap-2">
        <div className="flex items-center gap-1 md:gap-3 shrink-0">
          <button className="p-1.5 md:p-2 text-foreground hover:bg-surface rounded-lg transition-colors md:hidden">
            <Menu size={20} />
          </button>
          <button 
            onClick={() => router.push('/dashboard')}
            className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-foreground/70 hover:text-foreground border border-border hover:bg-surface px-3 py-1.5 rounded-md transition-colors"
          >
            Exit POS <span className="text-foreground/40 font-serif">→</span>
          </button>
          {session?.id ? (
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex items-center gap-2 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{session.session_code || 'Register Open'}</span>
              </div>
              <button
                onClick={() => setCashMovementOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-border hover:bg-background text-foreground/80 hover:text-foreground text-xs font-medium rounded-full transition-colors"
                title="Deposit float or record petty cash expense"
              >
                <ArrowDownCircle size={13} className="text-emerald-500" />
                <span>Cash In/Out</span>
              </button>
              <button
                onClick={() => setCloseSessionOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-orange-500/15 border border-orange-500/30 hover:bg-orange-500 hover:text-white text-orange-600 dark:text-orange-400 text-xs font-bold rounded-full transition-all shadow-sm"
                title="Count tender and close register"
              >
                <Calculator size={13} />
                <span>Close Register</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#714B67] hover:bg-[#5E3E56] text-white text-xs font-bold rounded-full transition-colors shadow-sm"
            >
              <Store size={13} />
              <span>Open Register</span>
            </button>
          )}
        </div>

        <div className="hidden md:flex items-center gap-2 text-pos-500 dark:text-pos-300 font-bold text-lg lg:text-xl shrink-0">
          <Store size={24} className="text-pos-500 dark:text-pos-300" />
          <span>Pharmacy POS</span>
        </div>

        <div className="flex items-center gap-1.5 md:gap-3 flex-1 md:flex-none justify-end">
          <div className="relative flex-1 max-w-[400px] md:w-[260px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input
              ref={searchInputRef}
              data-barcode-input="true"
              type="text"
              value={search}
              onChange={(e) => {
                const val = e.target.value;
                setSearch(val);
                setShowDropdown(true);

                // Fast scanner input detection (6-18 digits)
                const clean = val.trim();
                if (/^\d{6,18}$/.test(clean)) {
                  if (inputScanTimerRef.current) clearTimeout(inputScanTimerRef.current);
                  inputScanTimerRef.current = setTimeout(() => {
                    handleBarcodeScan(clean);
                  }, 100);
                }
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text').trim();
                if (pasted.length >= 3) {
                  setTimeout(() => handleBarcodeScan(pasted), 50);
                }
              }}
              onFocus={() => setShowDropdown(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const val = search.trim();
                  if (val) {
                    handleBarcodeScan(val);
                  }
                }
              }}
              placeholder="Search / Scan barcode... (F2)"
              className="w-full bg-surface border border-border text-foreground rounded-lg py-2 pl-9 pr-3 text-sm focus:outline-none focus:border-pos-400 focus:ring-1 focus:ring-pos-200 placeholder:text-foreground/40 transition-shadow"
            />

            {showDropdown && searchResults.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_25px_rgba(0,0,0,0.4)] max-h-[320px] overflow-y-auto z-50"
              >
                {searchResults.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleProductClick(p)}
                    className="p-3 border-b border-border hover:bg-surface cursor-pointer flex justify-between items-center last:border-b-0"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-sm text-foreground">{p.name}</span>
                      <div className="flex items-center gap-2 text-xs text-foreground/50 mt-0.5">
                        {p.shelf_stock !== undefined ? (
                          <>
                            <span className={p.shelf_stock === 0 ? "text-amber-500 font-semibold" : "text-emerald-500 font-medium"}>
                              Shelf: {p.shelf_stock}
                            </span>
                            <span>•</span>
                            <span>Store: {p.warehouse_stock || 0}</span>
                          </>
                        ) : (
                          <span>Stock: {p.stock}</span>
                        )}
                        <span>•</span>
                        <span>{p.category}</span>
                      </div>
                    </div>
                    <span className="font-bold text-sm text-pos-600">
                      {formatMoney(p.price, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="p-1.5 md:p-2 bg-transparent border border-border rounded-lg text-foreground hover:bg-surface transition-colors shrink-0"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={18} className="md:w-5 md:h-5" /> : <Moon size={18} className="md:w-5 md:h-5" />}
          </button>

          <button 
            onClick={() => setCameraScannerOpen(true)}
            className="p-1.5 md:p-2 bg-transparent border border-border rounded-lg text-foreground hover:bg-surface transition-colors shrink-0"
            title="Scan with Camera (F4)"
          >
            <Camera size={18} className="md:w-5 md:h-5 text-brand-500" />
          </button>

          <button 
            onClick={() => setDiagnosticsOpen(true)}
            className="p-1.5 md:p-2 bg-transparent border border-border rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-surface transition-colors shrink-0"
            title="Bluetooth & USB Scanner Diagnostics"
          >
            <ScanBarcode size={18} className="md:w-5 md:h-5" />
          </button>

          <button 
            onClick={() => setTerminalDiagnosticsOpen(true)}
            className="p-1.5 md:p-2 bg-transparent border border-border rounded-lg text-pos-600 dark:text-pos-400 hover:bg-surface transition-colors shrink-0"
            title="Terminal & PWA Offline Diagnostics"
          >
            <Activity size={18} className="md:w-5 md:h-5" />
          </button>

          {/* User Menu & Close Register */}
          <div className="relative shrink-0" ref={userMenuRef}>
            <button 
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-1 md:gap-2 hover:bg-surface rounded-lg p-1 md:pr-2 transition-colors border border-transparent hover:border-border"
            >
              <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-pos-500 text-white flex items-center justify-center font-bold text-xs md:text-sm">
                A
              </div>
              <span className="text-sm font-medium text-foreground/80 hidden lg:block">Administrator</span>
              <ChevronDown size={14} className="text-foreground/40 md:w-4 md:h-4" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-xl shadow-xl py-1.5 z-50">
                {session?.id ? (
                  <>
                    <div className="px-3 py-2 border-b border-border text-xs text-foreground/50">
                      Opening Float: <span className="font-semibold text-foreground">{formatMoney(session.opening_amount, currency)}</span>
                    </div>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setCashMovementOpen(true);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium transition-colors"
                    >
                      <ArrowDownCircle size={16} />
                      Cash In / Out
                    </button>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        setCloseSessionOpen(true);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background flex items-center gap-2 text-orange-500 font-medium transition-colors"
                    >
                      <Calculator size={16} />
                      Close Register
                    </button>
                    <div className="border-t border-border my-1" />
                  </>
                ) : null}
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    lock();
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-amber-600 dark:text-amber-400 hover:bg-background flex items-center gap-2 font-medium transition-colors"
                >
                  <Lock size={16} />
                  Lock Terminal
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    setPinModalOpen(true);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background flex items-center gap-2 transition-colors"
                >
                  <KeyRound size={16} />
                  Terminal Quick PIN
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    setTerminalDiagnosticsOpen(true);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background flex items-center gap-2 transition-colors"
                >
                  <Activity size={16} />
                  PWA Diagnostics
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push('/dashboard');
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background flex items-center gap-2 transition-colors"
                >
                  <LogOut size={16} />
                  Exit to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== CATALOG STALE WARNING BANNER ===== */}
      <CatalogStaleBanner branchId={(session as any)?.branch_id} onSynced={fetchPosData} />

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden h-full">
        
        {/* Mobile Tabs */}
        <div className="md:hidden flex border-b border-border bg-background shrink-0">
          <button
            onClick={() => setMobileTab('products')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${mobileTab === 'products' ? 'text-pos-600 border-b-2 border-pos-600' : 'text-foreground/60'}`}
          >
            Products
          </button>
          <button
            onClick={() => setMobileTab('cart')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${mobileTab === 'cart' ? 'text-pos-600 border-b-2 border-pos-600' : 'text-foreground/60'}`}
          >
            Cart ({cart.length})
          </button>
        </div>

        {/* Left: Cart Panel */}
        <div className={`w-full md:w-5/12 lg:w-[35%] h-full flex-col ${mobileTab === 'cart' ? 'flex' : 'hidden md:flex'}`}>
          <CartPanel onPayment={() => setPaymentMode(true)} products={products} />
        </div>

        {/* Right: Product Catalog */}
        <div className={`w-full md:w-7/12 lg:w-[65%] h-full flex-col ${mobileTab === 'products' ? 'flex' : 'hidden md:flex'}`}>
          <ProductCatalog
            products={products}
            categories={categories}
            onProductClick={handleProductClick}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* ===== PAYMENT MODAL ===== */}
      <PaymentModal
        open={paymentMode}
        onClose={() => setPaymentMode(false)}
        onSettingsOpen={() => { setPaymentMode(false); setSettingsOpen(true); }}
        onSaleComplete={fetchPosData}
        cashSessionId={session.id}
        onSaleSuccess={(receiptData) => {
          setSaleReceiptData(receiptData);
          setReceiptOpen(true);
        }}
      />

      {/* ===== PAYMENT SETTINGS MODAL ===== */}
      <PaymentSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Payment Success Receipt */}
      <SaleReceipt
        open={receiptOpen}
        onClose={() => {
          setReceiptOpen(false);
          setSaleReceiptData(null);
        }}
        saleData={saleReceiptData}
      />

      {/* Camera Barcode Scanner */}
      <BarcodeScanner
        isOpen={cameraScannerOpen}
        onClose={() => setCameraScannerOpen(false)}
        onScan={handleCameraScan}
        title="Scan Product Barcode"
      />

      {/* Hardware / Bluetooth Scanner Diagnostics Modal */}
      <ScannerDiagnosticsModal
        isOpen={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
        onTestScan={handleBarcodeScan}
        lastScannedCode={lastScannedCode}
        lastDebugEvent={lastDebugEvent}
      />

      {/* ===== CASH IN / OUT MODAL ===== */}
      {session?.id && (
        <CashMovementModal
          open={cashMovementOpen}
          onClose={() => setCashMovementOpen(false)}
          sessionId={session.id}
        />
      )}

      {/* ===== CLOSE REGISTER MODAL ===== */}
      <CloseSessionModal
        open={closeSessionOpen}
        onClose={() => setCloseSessionOpen(false)}
        sessionId={session.id}
        openingAmount={session.opening_amount}
        onCashMovementOpen={() => setCashMovementOpen(true)}
        onSessionClosed={() => {
          setCloseSessionOpen(false);
          router.push('/dashboard');
        }}
      />

      {/* ===== TERMINAL LOCK SCREEN ===== */}
      <LockScreen isLocked={isLocked} onUnlock={unlock} />

      {/* ===== TERMINAL PIN MODAL ===== */}
      <SetPinModal open={pinModalOpen} onClose={() => setPinModalOpen(false)} />

      {/* ===== TERMINAL DIAGNOSTICS MODAL ===== */}
      <TerminalDiagnosticsModal
        open={terminalDiagnosticsOpen}
        onClose={() => setTerminalDiagnosticsOpen(false)}
        branchId={(session as any)?.branch_id}
      />
    </div>
  );
}
