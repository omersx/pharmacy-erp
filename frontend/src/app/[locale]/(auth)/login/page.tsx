'use client';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter } from '@/i18n/routing';
import { useAuthStore } from '@/store/auth-store';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const login = useAuthStore(state => state.login);
  const isLoading = useAuthStore(state => state.isLoading);
  const theme = useAppStore(state => state.theme);
  const setTheme = useAppStore(state => state.setTheme);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const isPending = submitting || isLoading;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setSubmitting(true);
    try {
      await login({ email, password, remember_me: rememberMe });
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Invalid credentials');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-brand-500/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-teal-500/20 blur-[120px] rounded-full pointer-events-none" />

      {/* Theme Toggle in top corner */}
      <div className="absolute top-4 right-4 rtl:right-auto rtl:left-4 z-20">
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2.5 rounded-full bg-background/80 hover:bg-surface border border-border text-muted-foreground hover:text-foreground shadow-sm transition-all"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      
      <div className="z-10 w-full max-w-md p-6">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-24 h-24 bg-white dark:bg-[#0B1220] rounded-3xl flex items-center justify-center p-3 mb-4 shadow-xl border border-gray-200/80 dark:border-white/10 transition-colors">
            <Image src="/logo.png" alt="Pharma ERP Logo" width={88} height={88} className="w-full h-full object-contain" priority />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Pharma ERP</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('welcome')}</p>
        </div>

        <Card className="p-6 backdrop-blur-xl bg-background/80 shadow-2xl border-white/10">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Username or Email</label>
              <Input 
                type="text" 
                placeholder="admin" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('password')}</label>
              <div className="relative">
                <Input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isPending}
                  required
                  className="pr-10"
                />
                <button 
                  type="button"
                  disabled={isPending}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <input 
                type="checkbox" 
                id="remember" 
                checked={rememberMe}
                disabled={isPending}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-gray-300 text-brand-500 shadow-sm focus:border-brand-500 focus:ring-brand-500 h-4 w-4 bg-background disabled:opacity-50"
              />
              <label htmlFor="remember" className="text-sm text-foreground cursor-pointer">
                Stay signed in
              </label>
            </div>
            <Button 
              type="submit" 
              className="w-full mt-6" 
              loading={isPending}
              disabled={isPending}
            >
              {isPending ? tCommon('loading') : t('login')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
