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
      "bg-background border-r flex flex-col transition-all duration-300 z-20 h-full fixed md:relative",
      sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      sidebarCollapsed ? "w-20" : "w-64"
    )}>
      <div className="h-20 flex items-center justify-between px-4 border-b">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 relative overflow-visible">
              <Image src="/logo.png" alt="Pharma ERP Logo" width={100} height={100} className="object-contain scale-150" priority />
            </div>
            <span className="font-bold text-xl text-brand-600 dark:text-brand-400">Pharma ERP</span>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="mx-auto flex justify-center w-full items-center h-full overflow-visible">
            <Image src="/logo.png" alt="Pharma ERP Logo" width={100} height={100} className="object-contain scale-150" priority />
          </div>
        )}
        <button 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden md:flex p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
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
                  "flex items-center rounded-lg px-3 py-2.5 transition-colors group",
                  isActive 
                    ? "bg-brand-50 text-brand-600 dark:bg-brand-900/50 dark:text-brand-400" 
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.icon className={cn("flex-shrink-0", sidebarCollapsed ? "mx-auto" : "mr-3", isActive ? "text-brand-600 dark:text-brand-400" : "text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300")} size={20} />
                {!sidebarCollapsed && <span className="font-medium text-sm">{item.label}</span>}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  );
}
