'use client';
import { useAppStore } from '@/store/app-store';
import { Sidebar } from '@/components/ui/sidebar';
import { TopBar } from '@/components/ui/topbar';
import { useEffect, useState } from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useAppStore(state => state.sidebarOpen);
  const toggleSidebar = useAppStore(state => state.toggleSidebar);
  const theme = useAppStore(state => state.theme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  if (!mounted) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-10 md:hidden"
          onClick={toggleSidebar} 
        />
      )}
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-surface">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
        
        {/* Status Bar */}
        <footer className="h-8 border-t bg-background flex items-center px-4 text-xs text-gray-500 justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success"></span>
              Online
            </span>
            <span>Branch: Main Branch</span>
          </div>
          <div>Version 1.0.0</div>
        </footer>
      </div>
    </div>
  );
}
