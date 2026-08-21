'use client';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRouter } from '@/i18n/routing';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Activity, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const t = useTranslations('auth');
  const login = useAuthStore(state => state.login);
  const isLoading = useAuthStore(state => state.isLoading);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password, remember_me: rememberMe });
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.message || 'Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-brand-500/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-teal-500/20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="z-10 w-full max-w-md p-6">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-24 h-24 bg-white dark:bg-background rounded-2xl flex items-center justify-center mb-4 shadow-xl border border-border overflow-visible">
            <Image src="/logo.png" alt="Pharma ERP Logo" width={100} height={100} className="object-contain scale-[1.7]" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Pharma ERP</h1>
          <p className="text-gray-500 mt-2">{t('welcome')}</p>
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
                  required
                  className="pr-10"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
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
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-gray-300 text-brand-500 shadow-sm focus:border-brand-500 focus:ring-brand-500 h-4 w-4 bg-background"
              />
              <label htmlFor="remember" className="text-sm text-foreground cursor-pointer">
                Stay signed in
              </label>
            </div>
            <Button type="submit" className="w-full mt-6" loading={isLoading}>
              {t('login')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
