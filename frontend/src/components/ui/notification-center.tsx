'use client';

import { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Bell, Info, AlertTriangle, XCircle, CheckCircle, Trash2, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { useLocale, useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  title_ar?: string;
  message: string;
  message_ar?: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const locale = useLocale();
  const t = useTranslations('Notifications');

  const fetchUnreadCount = async () => {
    try {
      const data = await api.getUnreadNotificationCount() as { count: number };
      setUnreadCount(data.count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const data = await api.getNotifications() as Notification[];
      setNotifications(data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // 30s interval
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [isOpen]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.deleteNotification(id);
      setNotifications((prev) => {
        const notif = prev.find((n) => n.id === id);
        if (notif && !notif.is_read) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        return prev.filter((n) => n.id !== id);
      });
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'info':
        return <Info className="text-blue-500" size={20} />;
      case 'warning':
        return <AlertTriangle className="text-amber-500" size={20} />;
      case 'danger':
        return <XCircle className="text-red-500" size={20} />;
      case 'success':
        return <CheckCircle className="text-green-500" size={20} />;
      default:
        return <Info className="text-blue-500" size={20} />;
    }
  };

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMins < 1) return t('justNow');
    if (diffMins < 60) return t('minutesAgo', { count: diffMins });
    if (diffHrs < 24) return t('hoursAgo', { count: diffHrs });
    if (diffDays < 7) return t('daysAgo', { count: diffDays });
    
    return formatDate(date, locale);
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 relative transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/50">
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[8px] h-2 px-1 text-[10px] font-bold leading-none text-white bg-danger rounded-full border border-background flex items-center justify-center">
              {unreadCount > 9 ? '9+' : ''}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <AnimatePresence>
        {isOpen && (
          <Popover.Portal forceMount>
            <Popover.Content
              align="end"
              sideOffset={8}
              asChild
              className="z-50 w-80 sm:w-96 rounded-xl bg-surface/95 backdrop-blur-xl border border-border shadow-2xl overflow-hidden"
            >
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-surface/50">
                  <h3 className="font-semibold text-foreground text-lg">{t('title')}</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors flex items-center gap-1"
                    >
                      <CheckCheck size={14} />
                      {t('markAllAsRead')}
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-gray-400">
                        <Bell size={32} />
                      </div>
                      <p className="text-foreground font-medium">{t('noNotifications')}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t('noNotificationsDesc')}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {notifications.map((notification) => (
                        <div
                          key={notification.id}
                          onClick={() => !notification.is_read && handleMarkAsRead(notification.id)}
                          className={cn(
                            "relative group p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer flex gap-3",
                            !notification.is_read ? "bg-brand-500/5" : ""
                          )}
                        >
                          <div className="flex-shrink-0 mt-1">
                            {getIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1 gap-2">
                              <h4 className={cn("text-sm font-semibold truncate", !notification.is_read ? "text-foreground" : "text-muted-foreground")}>
                                {locale === 'ar' && notification.title_ar ? notification.title_ar : notification.title}
                              </h4>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                                {getRelativeTime(notification.created_at)}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 leading-snug">
                              {locale === 'ar' && notification.message_ar ? notification.message_ar : notification.message}
                            </p>
                          </div>
                          
                          <button
                            onClick={(e) => handleDelete(e, notification.id)}
                            className="absolute top-4 right-4 p-1.5 rounded-md text-gray-400 hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 transition-all focus:opacity-100 rtl:right-auto rtl:left-4"
                            aria-label={t('delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
