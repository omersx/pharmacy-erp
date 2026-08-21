'use client';

import '@/app/print.css';
import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useAppStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-density', 'touch');
    return () => {
      document.documentElement.removeAttribute('data-density');
    };
  }, []);

  // Apply dark class (same as app layout)
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface">
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
