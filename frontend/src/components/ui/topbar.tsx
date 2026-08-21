'use client';
import { useAppStore } from '@/store/app-store';
import { useAuthStore } from '@/store/auth-store';
import { Menu, Search, Bell, Sun, Moon, Globe } from 'lucide-react';
import { Input } from './input';
import { useRouter, usePathname } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { NotificationCenter } from './notification-center';

export function TopBar() {
  const toggleSidebar = useAppStore(state => state.toggleSidebar);
  const theme = useAppStore(state => state.theme);
  const setTheme = useAppStore(state => state.setTheme);
  const setLocaleStore = useAppStore(state => state.setLocale);
  const user = useAuthStore(state => state.user);
  const logoutAction = useAuthStore(state => state.logout);
  
  const handleLogout = () => {
    logoutAction();
    router.push('/login');
  };
  
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const toggleLanguage = () => {
    const nextLocale = locale === 'en' ? 'ar' : 'en';
    setLocaleStore(nextLocale);
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <header className="h-20 bg-background border-b flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <button 
          onClick={toggleSidebar}
          className="p-3 -ml-2 md:hidden rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
        >
          <Menu size={20} />
        </button>
        <div className="hidden md:block w-96">
          <Input 
            placeholder="Search anything (Cmd+K)..." 
            leadingIcon={<Search size={16} />}
            className="bg-surface border-transparent focus:border-brand-500 focus:bg-background"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <NotificationCenter />
        
        <button onClick={toggleLanguage} className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 font-medium text-sm flex items-center gap-1">
          <Globe size={18} />
          <span className="hidden sm:inline">{locale === 'en' ? 'عر' : 'EN'}</span>
        </button>

        <button onClick={toggleTheme} className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <div className="h-8 w-8 rounded-full bg-brand-500 text-white flex items-center justify-center font-semibold text-sm cursor-pointer ml-2 select-none hover:ring-2 hover:ring-brand-500/50 transition-all">
              {user?.full_name?.charAt(0) || 'A'}
            </div>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={5} className="w-48 bg-surface border border-border rounded-lg shadow-lg p-1 z-50 animate-in fade-in zoom-in duration-200">
              <div className="px-2 py-2 border-b border-border mb-1">
                <p className="text-sm font-medium text-foreground">{user?.full_name || 'Admin'}</p>
                <p className="text-xs text-muted-foreground">{user?.email || 'admin'}</p>
              </div>
              <DropdownMenu.Item 
                className="text-sm px-2 py-1.5 outline-none rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 text-foreground transition-colors flex items-center"
              >
                Profile Settings
              </DropdownMenu.Item>
              <DropdownMenu.Item 
                onClick={handleLogout}
                className="text-sm px-2 py-1.5 outline-none rounded-md cursor-pointer hover:bg-red-500/10 text-danger transition-colors flex items-center mt-1"
              >
                Log Out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
