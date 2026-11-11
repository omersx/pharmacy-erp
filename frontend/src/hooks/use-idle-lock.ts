'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseIdleLockOptions {
  /** Inactivity timeout in minutes before auto-locking. 0 disables auto-lock. Default: 5 min */
  timeoutMinutes?: number;
  /** Whether to lock when window/tab is hidden. Default: false */
  lockOnVisibilityHidden?: boolean;
  /** Whether idle lock is enabled. Default: true */
  enabled?: boolean;
}

export function useIdleLock(options: UseIdleLockOptions = {}) {
  const {
    timeoutMinutes = 5,
    lockOnVisibilityHidden = false,
    enabled = true,
  } = options;

  const [isLocked, setIsLocked] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('pos_terminal_locked') === 'true';
    }
    return false;
  });

  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const lock = useCallback(() => {
    setIsLocked(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pos_terminal_locked', 'true');
    }
  }, []);

  const unlock = useCallback(() => {
    setIsLocked(false);
    lastActivityRef.current = Date.now();
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('pos_terminal_locked');
    }
  }, []);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Inactivity polling loop
  useEffect(() => {
    if (!enabled || timeoutMinutes <= 0 || isLocked) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const checkInterval = 10_000; // Check every 10 seconds
    const timeoutMs = timeoutMinutes * 60 * 1000;

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= timeoutMs) {
        lock();
      }
    }, checkInterval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, timeoutMinutes, isLocked, lock]);

  // Activity listeners
  useEffect(() => {
    if (!enabled || isLocked) return;

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'pointerdown'];
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    const handleVisibility = () => {
      if (lockOnVisibilityHidden && document.visibilityState === 'hidden') {
        lock();
      } else {
        lastActivityRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, isLocked, lockOnVisibilityHidden, lock]);

  return {
    isLocked,
    lock,
    unlock,
    resetTimer,
  };
}
