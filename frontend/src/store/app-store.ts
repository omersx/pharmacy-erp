import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  currentBranch: string;
  theme: 'light' | 'dark';
  locale: 'en' | 'ar';
  density: 'compact' | 'comfortable' | 'touch';
  currency: string;
  inventoryMode: 'simple' | 'multi_location';
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setLocale: (locale: 'en' | 'ar') => void;
  setCurrency: (currency: string) => void;
  setInventoryMode: (mode: 'simple' | 'multi_location') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarCollapsed: false,
      currentBranch: 'Main Branch (Riyadh)',
      theme: 'light',
      locale: 'en',
      density: 'comfortable',
      currency: 'SDG',
      inventoryMode: 'multi_location',
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      setCurrency: (currency) => set({ currency }),
      setInventoryMode: (mode) => set({ inventoryMode: mode }),
    }),
    { name: 'app-storage' }
  )
);
