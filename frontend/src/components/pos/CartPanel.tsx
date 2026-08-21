'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, Keyboard, CreditCard, ShoppingCart, ChevronDown, ChevronUp, Delete, User, Percent, PauseCircle, Play, X, Phone, Check } from 'lucide-react';
import { usePosStore } from '@/store/pos-store';
import type { CartItem, HeldSale } from '@/store/pos-store';
import { useAppStore } from '@/store/app-store';
import { formatMoney } from '@/lib/utils';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type PanelType = 'customer' | 'discount' | 'hold' | 'keypad' | null;

export default function CartPanel({ onPayment, products = [] }: { onPayment: () => void; products?: any[] }) {
  const {
    cart,
    customer,
    subtotal,
    total,
    tax,
    discount,
    selectedItemId,
    keypadMode,
    keypadValue,
    heldSales,
    removeItem,
    updateQuantity,
    selectItem,
    setCustomer,
    applyDiscount,
    clearDiscount,
    holdCurrentSale,
    resumeSale,
    deleteHeldSale,
    setKeypadMode,
    setKeypadValue,
    applyKeypadValue,
  } = usePosStore();

  const { currency } = useAppStore();

  // Local UI state for active panel
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountInput, setDiscountInput] = useState('');
  const [holdNote, setHoldNote] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    if (activePanel === 'customer') {
      setLoadingCustomers(true);
      api.getCustomers()
        .then((data: any) => {
          setCustomers(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          toast.error('Failed to load customers');
          setCustomers([]);
        })
        .finally(() => setLoadingCustomers(false));
    }
  }, [activePanel]);

  const filteredCustomers = customerSearch
    ? customers.filter((c: any) => 
        c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone?.includes(customerSearch)
      )
    : customers;

  const togglePanel = (panel: PanelType) => {
    setActivePanel(activePanel === panel ? null : panel);
  };

  // Keypad handlers
  const handleNumpadPress = (val: string) => {
    setKeypadValue(keypadValue + val);
  };

  const handleBackspace = () => {
    if (keypadValue.length > 0) {
      setKeypadValue(keypadValue.slice(0, -1));
    }
  };

  const handleToggleSign = () => {
    if (keypadValue.startsWith('-')) {
      setKeypadValue(keypadValue.slice(1));
    } else if (keypadValue.length > 0) {
      setKeypadValue('-' + keypadValue);
    }
  };

  const handleModeChange = (mode: 'qty' | 'price' | 'discount') => {
    setKeypadMode(mode);
    if (keypadValue) {
      applyKeypadValue();
    }
  };

  // Discount handler
  const handleApplyDiscount = () => {
    const val = parseFloat(discountInput);
    if (isNaN(val) || val <= 0) return;
    applyDiscount(discountType, val);
    setDiscountInput('');
    setActivePanel(null);
  };

  // Hold handler
  const handleHoldSale = () => {
    holdCurrentSale(holdNote);
    setHoldNote('');
  };

  return (
    <div className="flex flex-col bg-background border-r border-border h-full w-full">
      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto">
        {cart?.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-foreground/40">
            <ShoppingCart size={48} className="mb-4 text-foreground/30" />
            <p>Start adding products</p>
          </div>
        ) : (
          <div className="py-2">
            {cart?.map((item: CartItem, index: number) => {
              const isSelected = item.id === selectedItemId;
              // Find the product's stock level
              const productStock = products.find((p: any) => p.medicine_id === item.medicine_id)?.stock;
              const isOverStock = productStock !== undefined && item.quantity > productStock;

              return (
                <div
                  key={item.id}
                  onClick={() => selectItem(item.id)}
                  className={`mx-2 mb-2 p-3 rounded-xl border ${isSelected ? 'border-pos-500 bg-pos-50 dark:bg-pos-500/20 shadow-sm' : 'border-border bg-background shadow-sm'} flex justify-between items-center cursor-pointer transition-all`}
                >
                  {/* Left: Index, Name, Info */}
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="bg-surface text-foreground/70 dark:bg-gray-700 dark:text-gray-300 text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold shrink-0">
                        {index + 1}
                      </div>
                      <span className="font-semibold text-foreground text-[13px] leading-tight truncate">
                        {item.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-foreground/50 ml-7">
                      Batch: {item.batch || 'N/A'} • {formatMoney(item.unit_price, currency)}/ea
                    </div>
                    {isOverStock && (
                      <div className="text-[10px] text-orange-500 font-medium ml-7 mt-0.5">
                        ⚠ Only {productStock} in stock
                      </div>
                    )}
                  </div>

                  {/* Right: Qty, Total, Trash */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center bg-background rounded-lg border border-border h-[30px] shadow-sm">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          updateQuantity(item.id, item.quantity - 1);
                        }}
                        className="px-2 h-full flex items-center justify-center text-foreground/60 hover:bg-surface rounded-l-lg transition-colors border-r border-border"
                      >
                        -
                      </button>
                      <span className="px-2 font-bold text-foreground min-w-[1.75rem] text-center text-sm">{item.quantity}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          updateQuantity(item.id, item.quantity + 1);
                        }}
                        className="px-2 h-full flex items-center justify-center text-foreground/60 hover:bg-surface rounded-r-lg transition-colors border-l border-border"
                      >
                        +
                      </button>
                    </div>

                    <div className="font-bold text-foreground text-sm w-[75px] text-right">
                      {formatMoney(item.line_total, currency)}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.id);
                      }}
                      className="text-foreground/40 hover:text-red-500 transition-colors bg-surface hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-md border border-border hover:border-red-200 dark:hover:border-red-800"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart Summary */}
      <div className="border-t border-border px-4 py-3 bg-background">
        {/* Customer info if selected */}
        {customer && (
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <User size={14} className="text-pos-500" />
              <span className="text-sm font-medium text-foreground">{customer.name}</span>
            </div>
            <button onClick={() => setCustomer(null)} className="text-foreground/40 hover:text-red-500 transition-colors">
              <X size={14} />
            </button>
          </div>
        )}
        {/* Discount info if applied */}
        {discount.type !== 'none' && (
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Percent size={14} className="text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">
                Discount ({discount.type === 'percentage' ? `${discount.value}%` : formatMoney(discount.value, currency)})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-green-600 dark:text-green-400">-{formatMoney(discount.amount, currency)}</span>
              <button onClick={clearDiscount} className="text-foreground/40 hover:text-red-500 transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-foreground/50">Taxes</span>
          <span className="text-sm text-foreground/50">{formatMoney(tax || 0, currency)}</span>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-lg font-bold text-foreground">Total</span>
          <span className="text-lg font-bold text-foreground">{formatMoney(total || 0, currency)}</span>
        </div>
      </div>

      {/* ===== 4 ACTION BUTTONS IN ONE ROW ===== */}
      <div className="grid grid-cols-4 border-t border-border bg-surface">
        <button
          onClick={() => togglePanel('customer')}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium border-r border-border transition-colors ${
            activePanel === 'customer' ? 'text-pos-500 bg-pos-50 dark:bg-pos-500/15' : 'text-foreground/60 hover:bg-background'
          }`}
        >
          <User size={18} />
          <span>Customer</span>
        </button>
        <button
          onClick={() => togglePanel('discount')}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium border-r border-border transition-colors ${
            activePanel === 'discount' ? 'text-pos-500 bg-pos-50 dark:bg-pos-500/15' : 'text-foreground/60 hover:bg-background'
          }`}
        >
          <Percent size={18} />
          <span>Discount</span>
        </button>
        <button
          onClick={() => togglePanel('hold')}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium border-r border-border transition-colors relative ${
            activePanel === 'hold' ? 'text-pos-500 bg-pos-50 dark:bg-pos-500/15' : 'text-foreground/60 hover:bg-background'
          }`}
        >
          <PauseCircle size={18} />
          <span>Hold</span>
          {heldSales.length > 0 && (
            <span className="absolute top-1 right-2 bg-orange-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {heldSales.length}
            </span>
          )}
        </button>
        <button
          onClick={() => togglePanel('keypad')}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
            activePanel === 'keypad' ? 'text-pos-500 bg-pos-50 dark:bg-pos-500/15' : 'text-foreground/60 hover:bg-background'
          }`}
        >
          <Keyboard size={18} />
          <span>Keypad</span>
        </button>
      </div>

      {/* ===== PANELS (slide down based on active) ===== */}

      {/* --- CUSTOMER PANEL --- */}
      {activePanel === 'customer' && (
        <div className="border-t border-border bg-background max-h-[250px] overflow-y-auto">
          <div className="p-2">
            <div className="text-[11px] font-semibold text-foreground/40 uppercase tracking-wide px-2 py-1">Select Customer</div>
            {/* Search */}
            <div className="px-2 mb-2">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search customers..."
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-pos-400 focus:ring-1 focus:ring-pos-200"
              />
            </div>
            {/* Walk-in option */}
            <button
              onClick={() => { setCustomer(null); setActivePanel(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mb-1 ${
                !customer ? 'bg-pos-50 dark:bg-pos-500/15 border border-pos-300' : 'hover:bg-surface border border-transparent'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                <User size={16} className="text-white" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-foreground">Walk-in Customer</div>
                <div className="text-[11px] text-foreground/40">No customer selected</div>
              </div>
              {!customer && <Check size={16} className="ml-auto text-pos-500" />}
            </button>
            {/* Customer list */}
            {loadingCustomers ? (
              <div className="text-center py-4 text-sm text-foreground/40">Loading customers...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-4 text-sm text-foreground/40">
                {customerSearch ? 'No customers found' : 'No customers yet'}
              </div>
            ) : (
              filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setCustomer({ id: c.id, name: c.name, phone: c.phone }); setActivePanel(null); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors mb-1 ${
                    customer?.id === c.id ? 'bg-pos-50 dark:bg-pos-500/15 border border-pos-300' : 'hover:bg-surface border border-transparent'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-pos-500 flex items-center justify-center text-white text-sm font-bold">
                    {c.name?.charAt(0) || '?'}
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{c.name}</div>
                    <div className="text-[11px] text-foreground/40 flex items-center gap-1">
                      <Phone size={10} /> {c.phone || 'No phone'}
                    </div>
                  </div>
                  {(c.credit_balance || 0) > 0 && (
                    <span className="text-[11px] font-medium text-orange-500">{formatMoney(c.credit_balance, currency)}</span>
                  )}
                  {customer?.id === c.id && <Check size={16} className="text-pos-500 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- DISCOUNT PANEL --- */}
      {activePanel === 'discount' && (
        <div className="border-t border-border bg-background p-3">
          <div className="text-[11px] font-semibold text-foreground/40 uppercase tracking-wide mb-2">Apply Discount</div>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setDiscountType('percentage')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                discountType === 'percentage'
                  ? 'bg-pos-50 dark:bg-pos-500/15 border-pos-300 text-pos-600 dark:text-pos-300'
                  : 'bg-surface border-border text-foreground/60 hover:bg-background'
              }`}
            >
              Percentage (%)
            </button>
            <button
              onClick={() => setDiscountType('fixed')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                discountType === 'fixed'
                  ? 'bg-pos-50 dark:bg-pos-500/15 border-pos-300 text-pos-600 dark:text-pos-300'
                  : 'bg-surface border-border text-foreground/60 hover:bg-background'
              }`}
            >
              Fixed ({currency})
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              placeholder={discountType === 'percentage' ? 'Enter %' : 'Enter amount'}
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-pos-400 focus:ring-1 focus:ring-pos-200"
            />
            <button
              onClick={handleApplyDiscount}
              className="bg-pos-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-pos-600 transition-colors"
            >
              Apply
            </button>
          </div>
          {discount.type !== 'none' && (
            <button
              onClick={() => { clearDiscount(); setActivePanel(null); }}
              className="w-full mt-2 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              Remove Current Discount
            </button>
          )}
        </div>
      )}

      {/* --- HOLD PANEL --- */}
      {activePanel === 'hold' && (
        <div className="border-t border-border bg-background max-h-[220px] overflow-y-auto p-3">
          {/* Hold current sale */}
          {cart.length > 0 && (
            <div className="mb-3 pb-3 border-b border-border">
              <div className="text-[11px] font-semibold text-foreground/40 uppercase tracking-wide mb-2">Hold Current Sale</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={holdNote}
                  onChange={(e) => setHoldNote(e.target.value)}
                  placeholder="Add a note (optional)"
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-pos-400"
                />
                <button
                  onClick={handleHoldSale}
                  className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors flex items-center gap-1.5"
                >
                  <PauseCircle size={16} /> Hold
                </button>
              </div>
            </div>
          )}
          {/* Held sales list */}
          <div className="text-[11px] font-semibold text-foreground/40 uppercase tracking-wide mb-2">
            Held Sales ({heldSales.length})
          </div>
          {heldSales.length === 0 ? (
            <p className="text-sm text-foreground/30 text-center py-3">No held sales</p>
          ) : (
            heldSales.map((sale: HeldSale) => (
              <div key={sale.id} className="flex items-center justify-between bg-surface rounded-lg p-2.5 mb-2 border border-border">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {sale.note || sale.id}
                  </div>
                  <div className="text-[11px] text-foreground/40">
                    {sale.cart.length} items • {formatMoney(sale.total, currency)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    onClick={() => { resumeSale(sale.id); setActivePanel(null); }}
                    className="p-1.5 rounded-md bg-pos-500 text-white hover:bg-pos-600 transition-colors"
                    title="Resume"
                  >
                    <Play size={14} />
                  </button>
                  <button
                    onClick={() => deleteHeldSale(sale.id)}
                    className="p-1.5 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* --- KEYPAD PANEL --- */}
      {activePanel === 'keypad' && (
        <div className="bg-background border-t border-border p-2">
          <div className="text-center text-xs font-medium text-foreground/50 mb-2">
            Editing: {keypadMode === 'qty' ? 'Quantity' : keypadMode === 'price' ? 'Price' : 'Discount'}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <button onClick={() => handleNumpadPress('1')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">1</button>
            <button onClick={() => handleNumpadPress('2')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">2</button>
            <button onClick={() => handleNumpadPress('3')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">3</button>
            <button onClick={() => handleModeChange('qty')} className={`h-[48px] rounded-lg text-[18px] font-semibold border ${keypadMode === 'qty' ? 'bg-pos-50 dark:bg-pos-500/15 border-pos-300 text-pos-700 dark:text-pos-300 font-bold' : 'bg-background border-border text-foreground hover:bg-surface active:bg-border'}`}>Qty</button>
            
            <button onClick={() => handleNumpadPress('4')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">4</button>
            <button onClick={() => handleNumpadPress('5')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">5</button>
            <button onClick={() => handleNumpadPress('6')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">6</button>
            <button onClick={() => handleModeChange('discount')} className={`h-[48px] rounded-lg text-[18px] font-semibold border ${keypadMode === 'discount' ? 'bg-pos-50 dark:bg-pos-500/15 border-pos-300 text-pos-700 dark:text-pos-300 font-bold' : 'bg-background border-border text-foreground hover:bg-surface active:bg-border'}`}>%</button>

            <button onClick={() => handleNumpadPress('7')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">7</button>
            <button onClick={() => handleNumpadPress('8')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">8</button>
            <button onClick={() => handleNumpadPress('9')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">9</button>
            <button onClick={() => handleModeChange('price')} className={`h-[48px] rounded-lg text-[18px] font-semibold border ${keypadMode === 'price' ? 'bg-pos-50 dark:bg-pos-500/15 border-pos-300 text-pos-700 dark:text-pos-300 font-bold' : 'bg-background border-border text-foreground hover:bg-surface active:bg-border'}`}>Price</button>

            <button onClick={handleToggleSign} className="h-[48px] bg-[#21B573] rounded-lg text-[18px] font-bold text-white hover:bg-[#1DA065] active:bg-[#198E59]">+/-</button>
            <button onClick={() => handleNumpadPress('0')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">0</button>
            <button onClick={() => handleNumpadPress('.')} className="h-[48px] bg-background border border-border rounded-lg text-[18px] font-semibold text-foreground hover:bg-surface active:bg-border">.</button>
            <button onClick={handleBackspace} className="h-[48px] bg-[#E8913A] rounded-lg text-[18px] font-bold text-white hover:bg-[#D68130] active:bg-[#C27328] flex items-center justify-center">
              <Delete size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Payment Button */}
      <div className="p-2 md:p-3 bg-surface border-t border-border">
        <button
          onClick={onPayment}
          disabled={!cart || cart.length === 0}
          className={`w-full py-4 rounded-lg flex items-center justify-center gap-2 text-lg font-bold transition-colors ${
            !cart || cart.length === 0
              ? 'bg-border text-foreground/40 cursor-not-allowed'
              : 'bg-pos-500 text-white hover:bg-pos-600'
          }`}
        >
          <CreditCard size={24} />
          Payment
        </button>
      </div>
    </div>
  );
}
