'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { useRouter, usePathname } from '@/i18n/routing';
import { useLocale } from 'next-intl';

/**
 * AuthGuard wraps protected pages. It calls checkAuth() on mount,
 * shows a loading spinner while verifying, and redirects to /login
 * if the user is not authenticated. This prevents the "flash of
 * dashboard" that happens when the page renders before the auth
 * check completes.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, checkAuth } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      await checkAuth();
      if (!cancelled) {
        setChecking(false);
      }
    }

    verify();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Once checking is done, if not authenticated, redirect to login
    if (!checking && !useAuthStore.getState().isAuthenticated) {
      router.replace('/login');
    }
  }, [checking, router]);

  // While verifying auth, show a centered spinner
  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    );
  }

  // If not authenticated after check, render nothing (redirect is in progress)
  if (!useAuthStore.getState().isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
