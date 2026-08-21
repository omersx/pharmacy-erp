import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  full_name: string;
  full_name_ar?: string;
  role: string;
  is_active: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: { email: string; password: string; remember_me?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const user = await api.login(credentials) as User;
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message || 'Login failed' });
      throw e;
    }
  },
  logout: async () => {
    try {
      await api.logout();
    } catch {} 
    set({ user: null, isAuthenticated: false });
  },
  checkAuth: async () => {
    try {
      const user = await api.getMe() as User;
      set({ user, isAuthenticated: true });
    } catch {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
