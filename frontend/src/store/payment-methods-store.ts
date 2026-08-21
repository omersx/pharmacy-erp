import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'cash' | 'mobile';
  logo: string; // emoji or URL
  enabled: boolean;
  color: string; // hex color for the card accent
}

export interface CompletedSale {
  id: string;
  items: { name: string; quantity: number; unit_price: number; line_total: number }[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentType: 'cash' | 'mobile';
  customerName: string | null;
  timestamp: string; // ISO string
}

interface PaymentMethodsState {
  methods: PaymentMethod[];
  completedSales: CompletedSale[];
  requireCashSession: boolean;

  // Settings
  setRequireCashSession: (val: boolean) => void;

  // Methods CRUD
  addMethod: (method: Omit<PaymentMethod, 'id'>) => void;
  updateMethod: (id: string, updates: Partial<Omit<PaymentMethod, 'id'>>) => void;
  deleteMethod: (id: string) => void;
  toggleMethod: (id: string) => void;

  // Sales
  recordSale: (sale: Omit<CompletedSale, 'id' | 'timestamp'>) => void;
  clearSalesHistory: () => void;

  // Computed helpers
  getSalesTotals: () => {
    cash: number;
    mobile: number;
    byMethod: Record<string, { name: string; total: number; count: number }>;
    grandTotal: number;
    totalCount: number;
  };
}

const defaultMethods: PaymentMethod[] = [
  { id: 'cash', name: 'Cash', type: 'cash', logo: '💵', enabled: true, color: '#22C55E' },
  { id: 'bankak', name: 'Bankak', type: 'mobile', logo: '🏦', enabled: true, color: '#3B82F6' },
  { id: 'fawry', name: 'Fawry', type: 'mobile', logo: '📱', enabled: true, color: '#F59E0B' },
  { id: 'amin', name: 'Amin', type: 'mobile', logo: '💳', enabled: true, color: '#8B5CF6' },
];

export const usePaymentMethodsStore = create<PaymentMethodsState>()(
  persist(
    (set, get) => ({
      methods: defaultMethods,
      completedSales: [],
      requireCashSession: false, // Default to false (optional)

      setRequireCashSession: (val) => set({ requireCashSession: val }),

      addMethod: (method) =>
        set((state) => ({
          methods: [
            ...state.methods,
            { ...method, id: `pm-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` },
          ],
        })),

      updateMethod: (id, updates) =>
        set((state) => ({
          methods: state.methods.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),

      deleteMethod: (id) =>
        set((state) => ({
          methods: state.methods.filter((m) => m.id !== id),
        })),

      toggleMethod: (id) =>
        set((state) => ({
          methods: state.methods.map((m) =>
            m.id === id ? { ...m, enabled: !m.enabled } : m
          ),
        })),

      recordSale: (sale) =>
        set((state) => ({
          completedSales: [
            ...state.completedSales,
            {
              ...sale,
              id: `sale-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              timestamp: new Date().toISOString(),
            },
          ],
        })),

      clearSalesHistory: () => set({ completedSales: [] }),

      getSalesTotals: () => {
        const { completedSales } = get();
        let cash = 0;
        let mobile = 0;
        const byMethod: Record<string, { name: string; total: number; count: number }> = {};

        for (const sale of completedSales) {
          if (sale.paymentType === 'cash') {
            cash += sale.total;
          } else {
            mobile += sale.total;
          }

          if (!byMethod[sale.paymentMethodId]) {
            byMethod[sale.paymentMethodId] = { name: sale.paymentMethodName, total: 0, count: 0 };
          }
          byMethod[sale.paymentMethodId].total += sale.total;
          byMethod[sale.paymentMethodId].count += 1;
        }

        return {
          cash,
          mobile,
          byMethod,
          grandTotal: cash + mobile,
          totalCount: completedSales.length,
        };
      },
    }),
    {
      name: 'payment-methods-storage',
    }
  )
);
