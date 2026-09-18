'use client';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useAppStore } from '@/store/app-store';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  MonitorPlay, 
  Package, 
  ShoppingCart,
  Users,
  FileText,
  Settings,
  Pill,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export function Sidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const sidebarOpen = useAppStore(state => state.sidebarOpen);
  const sidebarCollapsed = useAppStore(state => state.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore(state => state.setSidebarCollapsed);

  const navItems = [
    { icon: LayoutDashboard, label: t('dashboard'), href: '/dashboard' },
    { icon: MonitorPlay, label: t('pos'), href: '/pos' },
    { icon: ShoppingCart, label: t('sales'), href: '/sales' },
    { icon: Package, label: t('inventory'), href: '/inventory' },
    { icon: Pill, label: t('catalog'), href: '/catalog/products' },
    { icon: Users, label: t('customers'), href: '/customers' },
    { icon: FileText, label: t('reports'), href: '/reports' },
    { icon: Settings, label: t('admin'), href: '/admin' },
  ];

  return (
    <aside className={cn(
      "bg-background border-r rtl:border-r-0 rtl:border-l flex flex-col transition-all duration-300 z-20 h-full fixed md:relative",
      sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 rtl:translate-x-full rtl:md:translate-x-0",
      sidebarCollapsed ? "w-20" : "w-64"
    )}>
      {/* Floating Collapse/Expand toggle on the sidebar border */}
      <button 
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="hidden md:flex absolute -right-3.5 rtl:-left-3.5 rtl:right-auto top-[26px] z-30 w-7 h-7 rounded-full bg-background border border-border shadow-md items-center justify-center text-gray-500 hover:text-foreground hover:bg-surface hover:scale-110 transition-all cursor-pointer"
        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <ChevronRight size={14} className={cn("transition-transform duration-200 rtl:rotate-180", !sidebarCollapsed && "rotate-180 rtl:rotate-0")} />
      </button>

      {/* Brand Header */}
      <div className={cn(
        "h-20 flex items-center border-b transition-all duration-300",
        sidebarCollapsed ? "justify-center px-2" : "px-4"
      )}>
        <Link href="/dashboard" className="flex items-center gap-3 group overflow-hidden w-full">
          <div className={cn(
            "flex items-center justify-center rounded-xl bg-surface/80 transition-all group-hover:scale-105 border border-border/50 shadow-sm flex-shrink-0",
            sidebarCollapsed ? "w-10 h-10 p-1.5 mx-auto" : "w-10 h-10 p-1.5"
          )}>
            <Image 
              src="/logo.png" 
              alt="Pharma ERP Logo" 
              width={40} 
              height={40} 
              className="w-full h-full object-contain" 
              priority 
            />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-base leading-tight text-brand-600 dark:text-brand-400 truncate">Pharma ERP</span>
              <span className="text-[11px] text-muted-foreground truncate font-medium">Management & POS</span>
            </div>
          )}
        </Link>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link 
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors group",
                  isActive 
                    ? "bg-brand-50 text-brand-600 dark:bg-brand-900/50 dark:text-brand-400" 
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.icon className={cn("flex-shrink-0", sidebarCollapsed && "mx-auto", isActive ? "text-brand-600 dark:text-brand-400" : "text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300")} size={20} />
                {!sidebarCollapsed && <span className="font-medium text-sm truncate">{item.label}</span>}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  );
}
