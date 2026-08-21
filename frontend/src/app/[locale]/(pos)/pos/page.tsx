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
import { SaleReceipt } from '@/components/pos/SaleReceipt';
import type { Product } from '@/components/pos/ProductCatalog';
import {
  Menu,
  Search,
  ScanBarcode,
  ChevronDown,
  User,
  X,
  Store,
  Sun,
  Moon,
  LogOut,
  Calculator,
} from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import toast from 'react-hot-toast';

export default function PosPage() {
  return (
    <CashSessionGuard>
      {(session) => <PosContent session={session} />}
    </CashSessionGuard>
  );
}

function PosContent({ session }: { session: { id: string; opening_amount: number; opened_at: string } }) {
  const [search, setSearch] = useState('');
  const [paymentMode, setPaymentMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [closeSessionOpen, setCloseSessionOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'cart' | 'products'>('products');
  
  // Receipt State
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [saleReceiptData, setSaleReceiptData] = useState<any>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { currency, theme, setTheme } = useAppStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(['All']);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPosData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [medicines, stockItems, categoriesTree]: [any, any, any] = await Promise.all([
        api.getMedicines().catch(() => []),
        api.getStock().catch(() => []),
        api.getCategoryTree().catch(() => [])
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
      
      const medList = Array.isArray(medicines) ? medicines : [];
      const realProducts: Product[] = medList.map((med: any) => ({
        id: med.id,
        medicine_id: med.id,
        name: med.name_en || med.name || 'Unknown',
        category: med.category_id ? (catMap.get(med.category_id) || 'Other') : 'Other',
        price: Number(med.selling_price) || 0,
        stock: stockMap.get(med.id) || 0,
        batch: '-',
        lot_number: '-',
        expiry: '-',
        requires_prescription: med.requires_prescription || false,
        favorite: false
      }));
      
      const catSet = new Set<string>(['All']);
      realProducts.forEach(p => catSet.add(p.category));
      
      setProducts(realProducts);
      setCategories(Array.from(catSet));
    } catch (error) {
      console.error('Failed to fetch POS data', error);
      setProducts([]);
      setCategories(['All']);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosData();
  }, [fetchPosData]);

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

  // Barcode Scanner Listener (Detect hardware scanners fast-typing + enter)
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Global keyboard shortcuts
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'F9' && cart.length > 0) {
        e.preventDefault();
        setPaymentMode(true);
        return;
      }
      if (e.key === 'Escape') {
        if (paymentMode) setPaymentMode(false);
        if (showDropdown) setShowDropdown(false);
        if (userMenuOpen) setUserMenuOpen(false);
        return;
      }

      // If user is focused on an input/textarea (not scanning outside), skip global barcode hook
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive = activeTag === 'input' || activeTag === 'textarea';

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      // Barcode scanners usually send characters within 30-50ms of each other
      if (timeDiff > 80) {
        barcodeBuffer = '';
      }

      if (e.key === 'Enter') {
        if (barcodeBuffer.length >= 3) {
          e.preventDefault();
          const scannedCode = barcodeBuffer.trim();
          barcodeBuffer = '';
          
          // Look up scanned barcode in products list or via API search
          const found = products.find(p => p.id === scannedCode || p.name.toLowerCase() === scannedCode.toLowerCase());
          if (found) {
            handleProductClick(found);
            toast.success(`Scanned: ${found.name}`);
          } else {
            api.searchMedicines(scannedCode)
              .then((res: any) => {
                if (Array.isArray(res) && res.length > 0) {
                  const match = products.find(p => p.medicine_id === res[0].id);
                  if (match) {
                    handleProductClick(match);
                    toast.success(`Scanned: ${match.name}`);
                  } else {
                    toast.error(`Scanned item not in stock catalog`);
                  }
                } else {
                  toast.error(`Barcode not found: ${scannedCode}`);
                }
              })
              .catch(() => {
                toast.error(`Product not found for code: ${scannedCode}`);
              });
          }
        }
      } else if (e.key.length === 1 && !isInputActive) {
        barcodeBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.length, paymentMode, showDropdown, userMenuOpen, products, handleProductClick]);

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
          {session?.id && (
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Register Open</span>
            </div>
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
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
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
                      <span className="text-xs text-foreground/50">
                        Stock: {p.stock} | {p.stock === 0 ? 'Out of stock' : 'In stock'}
                      </span>
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
            onClick={() => searchInputRef.current?.focus()}
            className="p-1.5 md:p-2 bg-transparent border border-border rounded-lg text-foreground hover:bg-surface transition-colors shrink-0"
            title="Scan Barcode (Focus Search)"
          >
            <ScanBarcode size={18} className="md:w-5 md:h-5" />
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
                        setCloseSessionOpen(true);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-background flex items-center gap-2 text-orange-500 font-medium transition-colors"
                    >
                      <Calculator size={16} />
                      Close Register
                    </button>
                  </>
                ) : null}
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

      {/* ===== SALE RECEIPT MODAL ===== */}
      <SaleReceipt
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        saleData={saleReceiptData}
      />

      {/* ===== CLOSE REGISTER MODAL ===== */}
      <CloseSessionModal
        open={closeSessionOpen}
        onClose={() => setCloseSessionOpen(false)}
        sessionId={session.id}
        openingAmount={session.opening_amount}
        onSessionClosed={() => {
          setCloseSessionOpen(false);
          window.location.reload();
        }}
      />
    </div>
  );
}
