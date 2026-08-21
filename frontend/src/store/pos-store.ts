import { create } from 'zustand';

export interface CartItem {
  id: string;
  medicine_id: string;
  name: string;
  batch: string;
  lot_number: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface CustomerInfo {
  id: string;
  name: string;
  phone?: string;
}

export interface DiscountInfo {
  type: 'none' | 'percentage' | 'fixed' | 'final_total';
  value: number;
  amount: number;
}

export interface HeldSale {
  id: string;
  cart: CartItem[];
  customer: CustomerInfo | null;
  discount: DiscountInfo;
  subtotal: number;
  total: number;
  timestamp: Date;
  note: string;
}

interface PosState {
  // Cart
  cart: CartItem[];
  customer: CustomerInfo | null;
  subtotal: number;
  total: number;
  tax: number;
  
  // Discount
  discount: DiscountInfo;
  
  // Held sales
  heldSales: HeldSale[];
  
  // UI State
  keypadVisible: boolean;
  keypadMode: 'qty' | 'price' | 'discount';
  keypadValue: string;
  selectedItemId: string | null;
  activePanel: 'keypad' | 'customer' | 'discount' | 'hold' | null;
  
  // Cart actions
  addItem: (item: Omit<CartItem, 'id' | 'line_total'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  selectItem: (id: string | null) => void;
  
  // Customer
  setCustomer: (customer: CustomerInfo | null) => void;
  
  // Discount
  applyDiscount: (type: 'percentage' | 'fixed' | 'final_total', value: number) => void;
  clearDiscount: () => void;
  
  // Hold/Resume
  holdCurrentSale: (note?: string) => void;
  resumeSale: (id: string) => void;
  deleteHeldSale: (id: string) => void;
  
  // Sale completion
  completeSale: () => void;
  
  // Keypad
  toggleKeypad: () => void;
  setKeypadMode: (mode: 'qty' | 'price' | 'discount') => void;
  setKeypadValue: (value: string) => void;
  applyKeypadValue: () => void;
  
  // Panel
  setActivePanel: (panel: 'keypad' | 'customer' | 'discount' | 'hold' | null) => void;
}

const recalculate = (cart: CartItem[], discount: DiscountInfo) => {
  const subtotal = cart.reduce((acc, item) => acc + item.line_total, 0);
  let discountAmount = 0;

  switch (discount.type) {
    case 'percentage':
      discountAmount = subtotal * (discount.value / 100);
      break;
    case 'fixed':
      discountAmount = discount.value;
      break;
    case 'final_total':
      discountAmount = Math.max(0, subtotal - discount.value);
      break;
    default:
      discountAmount = 0;
  }

  const total = Math.max(0, subtotal - discountAmount);
  return { subtotal, total, discountAmount };
};

export const usePosStore = create<PosState>((set, get) => ({
  cart: [],
  customer: null,
  subtotal: 0,
  total: 0,
  tax: 0,
  discount: { type: 'none', value: 0, amount: 0 },
  heldSales: [],
  keypadVisible: false,
  keypadMode: 'qty',
  keypadValue: '',
  selectedItemId: null,
  activePanel: null,

  addItem: (item) => set((state) => {
    const existingItemIndex = state.cart.findIndex(
      (i) => i.medicine_id === item.medicine_id && i.batch === item.batch
    );

    let newCart = [...state.cart];
    
    if (existingItemIndex >= 0) {
      const existingItem = newCart[existingItemIndex];
      const newQuantity = existingItem.quantity + item.quantity;
      newCart[existingItemIndex] = {
        ...existingItem,
        quantity: newQuantity,
        line_total: newQuantity * existingItem.unit_price,
      };
    } else {
      const newItem: CartItem = {
        ...item,
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        line_total: item.quantity * item.unit_price,
      };
      newCart.push(newItem);
    }

    const { subtotal, total, discountAmount } = recalculate(newCart, state.discount);

    return {
      cart: newCart,
      subtotal,
      total,
      discount: { ...state.discount, amount: discountAmount },
      selectedItemId: existingItemIndex >= 0 ? newCart[existingItemIndex].id : newCart[newCart.length - 1].id,
    };
  }),

  removeItem: (id) => set((state) => {
    const newCart = state.cart.filter((item) => item.id !== id);
    const { subtotal, total, discountAmount } = recalculate(newCart, state.discount);

    return {
      cart: newCart,
      subtotal,
      total,
      discount: { ...state.discount, amount: discountAmount },
      selectedItemId: state.selectedItemId === id ? null : state.selectedItemId,
    };
  }),

  updateQuantity: (id, quantity) => set((state) => {
    if (quantity <= 0) {
      const newCart = state.cart.filter((item) => item.id !== id);
      const { subtotal, total, discountAmount } = recalculate(newCart, state.discount);
      return {
        cart: newCart,
        subtotal,
        total,
        discount: { ...state.discount, amount: discountAmount },
        selectedItemId: state.selectedItemId === id ? null : state.selectedItemId,
      };
    }

    const newCart = state.cart.map((item) =>
      item.id === id
        ? { ...item, quantity, line_total: quantity * item.unit_price }
        : item
    );

    const { subtotal, total, discountAmount } = recalculate(newCart, state.discount);

    return {
      cart: newCart,
      subtotal,
      total,
      discount: { ...state.discount, amount: discountAmount },
    };
  }),

  clearCart: () => set({
    cart: [],
    subtotal: 0,
    total: 0,
    discount: { type: 'none', value: 0, amount: 0 },
    customer: null,
    selectedItemId: null,
  }),

  selectItem: (id) => set({ selectedItemId: id }),

  setCustomer: (customer) => set({ customer }),

  applyDiscount: (type, value) => set((state) => {
    const newDiscount: DiscountInfo = { type, value, amount: 0 };
    const { subtotal, total, discountAmount } = recalculate(state.cart, newDiscount);
    newDiscount.amount = discountAmount;

    return {
      discount: newDiscount,
      subtotal,
      total,
    };
  }),

  clearDiscount: () => set((state) => {
    const newDiscount: DiscountInfo = { type: 'none', value: 0, amount: 0 };
    const { subtotal, total } = recalculate(state.cart, newDiscount);

    return {
      discount: newDiscount,
      subtotal,
      total,
    };
  }),

  holdCurrentSale: (note = '') => set((state) => {
    if (state.cart.length === 0) return state;

    const newHeldSale: HeldSale = {
      id: `HOLD-${Date.now()}`,
      cart: [...state.cart],
      customer: state.customer,
      discount: { ...state.discount },
      subtotal: state.subtotal,
      total: state.total,
      timestamp: new Date(),
      note,
    };

    return {
      heldSales: [...state.heldSales, newHeldSale],
      cart: [],
      customer: null,
      subtotal: 0,
      total: 0,
      discount: { type: 'none', value: 0, amount: 0 },
      selectedItemId: null,
    };
  }),

  resumeSale: (id) => set((state) => {
    const saleToResume = state.heldSales.find((sale) => sale.id === id);
    if (!saleToResume) return state;

    return {
      cart: saleToResume.cart,
      customer: saleToResume.customer,
      discount: saleToResume.discount,
      subtotal: saleToResume.subtotal,
      total: saleToResume.total,
      heldSales: state.heldSales.filter((sale) => sale.id !== id),
      selectedItemId: null,
    };
  }),

  deleteHeldSale: (id) => set((state) => ({
    heldSales: state.heldSales.filter((sale) => sale.id !== id),
  })),

  completeSale: () => set({
    cart: [],
    customer: null,
    subtotal: 0,
    total: 0,
    discount: { type: 'none', value: 0, amount: 0 },
    selectedItemId: null,
  }),

  toggleKeypad: () => set((state) => ({ keypadVisible: !state.keypadVisible })),

  setKeypadMode: (mode) => set({ keypadMode: mode, keypadValue: '' }),

  setKeypadValue: (value) => set({ keypadValue: value }),

  applyKeypadValue: () => set((state) => {
    if (!state.selectedItemId && state.keypadMode !== 'discount') return state;

    const numericValue = parseFloat(state.keypadValue);
    if (isNaN(numericValue) && state.keypadValue !== '') return state;

    if (state.keypadMode === 'qty' && state.selectedItemId) {
      if (state.keypadValue === '') return state;
      const newCart = state.cart.map((item) => {
        if (item.id === state.selectedItemId) {
          const newQty = numericValue;
          return { ...item, quantity: newQty, line_total: newQty * item.unit_price };
        }
        return item;
      }).filter((item) => item.quantity > 0);
      
      const { subtotal, total, discountAmount } = recalculate(newCart, state.discount);
      return { cart: newCart, subtotal, total, discount: { ...state.discount, amount: discountAmount }, keypadValue: '' };
    }

    if (state.keypadMode === 'price' && state.selectedItemId) {
      if (state.keypadValue === '') return state;
      const newCart = state.cart.map((item) => {
        if (item.id === state.selectedItemId) {
          return { ...item, unit_price: numericValue, line_total: item.quantity * numericValue };
        }
        return item;
      });
      
      const { subtotal, total, discountAmount } = recalculate(newCart, state.discount);
      return { cart: newCart, subtotal, total, discount: { ...state.discount, amount: discountAmount }, keypadValue: '' };
    }

    if (state.keypadMode === 'discount') {
      if (state.keypadValue === '') return state;
      // Simple logic: apply percentage for keypad, could be expanded. Let's just apply percentage.
      const newDiscount: DiscountInfo = { type: 'percentage', value: numericValue, amount: 0 };
      const { subtotal, total, discountAmount } = recalculate(state.cart, newDiscount);
      newDiscount.amount = discountAmount;
      return { discount: newDiscount, subtotal, total, keypadValue: '' };
    }

    return state;
  }),

  setActivePanel: (panel) => set({ activePanel: panel }),
}));
