'use client';

import React from 'react';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { useCurrentLocale } from '@/hooks/use-locale';
import { SunMedium, Moon } from 'lucide-react';
import toast from 'react-hot-toast';

interface WakeLockButtonProps {
  className?: string;
  autoRequest?: boolean;
}

export function WakeLockButton({ className = '', autoRequest = true }: WakeLockButtonProps) {
  const { isAr } = useCurrentLocale();
  const { isSupported, isLocked, toggle } = useWakeLock({
    autoRequest,
    onRequest: () => {
      // quiet activation
    },
    onRelease: () => {
      // quiet release
    },
    onError: (err) => {
      toast.error(
        isAr
          ? `قفل الشاشة غير متاح: ${err.message || 'تم رفض الإذن'}`
          : `Screen wake lock unavailable: ${err.message || 'Permission denied'}`
      );
    },
  });

  if (!isSupported) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await toggle();
        if (!isLocked) {
          toast.success(
            isAr ? '☀️ تم تفعيل إبقاء الشاشة نشطة' : '☀️ Screen Keep-Awake activated',
            { id: 'wakelock-toast' }
          );
        } else {
          toast(
            isAr ? '🌙 تم إلغاء تفعيل إبقاء الشاشة نشطة' : '🌙 Screen Keep-Awake deactivated',
            { id: 'wakelock-toast' }
          );
        }
      }}
      className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all border select-none ${
        isLocked
          ? 'bg-amber-500/15 border-amber-500/30 text-amber-500 hover:bg-amber-500/25'
          : 'bg-surface border-border text-foreground/50 hover:text-foreground hover:bg-surface/80'
      } ${className}`}
      title={
        isLocked
          ? isAr
            ? 'شاشة نقطة البيع نشطة دائماً (انقر للسماح بسكون الشاشة)'
            : 'Terminal screen is kept awake (click to allow display sleep)'
          : isAr
          ? 'انقر لإبقاء شاشة نقطة البيع نشطة طوال الوردية'
          : 'Click to keep terminal screen awake during shift'
      }
    >
      {isLocked ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          <SunMedium size={13} className="shrink-0" />
          <span className="hidden xl:inline">{isAr ? 'الشاشة نشطة' : 'Awake'}</span>
        </>
      ) : (
        <>
          <Moon size={13} className="shrink-0 opacity-60" />
          <span className="hidden xl:inline">{isAr ? 'وضع السكون' : 'Sleep allowed'}</span>
        </>
      )}
    </button>
  );
}
