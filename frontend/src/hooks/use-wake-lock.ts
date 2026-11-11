'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseWakeLockOptions {
  autoRequest?: boolean;
  onRequest?: () => void;
  onRelease?: () => void;
  onError?: (err: Error) => void;
}

export interface UseWakeLockReturn {
  isSupported: boolean;
  isLocked: boolean;
  request: () => Promise<boolean>;
  release: () => Promise<void>;
  toggle: () => Promise<void>;
}

/**
 * Screen Wake Lock API hook
 * Prevents POS counter terminals and cashier screens from sleeping or dimming.
 * Handles automatic re-acquisition on tab visibility changes.
 * Conforms to PWA implementation guide §8.4.
 */
export function useWakeLock(options: UseWakeLockOptions = {}): UseWakeLockReturn {
  const { autoRequest = false, onRequest, onRelease, onError } = options;

  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Sentinel reference
  const wakeLockRef = useRef<any>(null);
  const shouldBeActiveRef = useRef<boolean>(autoRequest);

  useEffect(() => {
    setIsSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator);
  }, []);

  const request = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }

    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        setIsLocked(true);
        return true;
      }

      const sentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      shouldBeActiveRef.current = true;
      setIsLocked(true);

      sentinel.addEventListener('release', () => {
        wakeLockRef.current = null;
        setIsLocked(false);
        onRelease?.();
      });

      onRequest?.();
      return true;
    } catch (err: any) {
      console.warn('[PWA WakeLock] Failed to acquire screen wake lock:', err);
      wakeLockRef.current = null;
      setIsLocked(false);
      onError?.(err);
      return false;
    }
  }, [onRequest, onRelease, onError]);

  const release = useCallback(async (): Promise<void> => {
    shouldBeActiveRef.current = false;
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        console.warn('[PWA WakeLock] Error releasing wake lock:', err);
      } finally {
        wakeLockRef.current = null;
        setIsLocked(false);
      }
    }
  }, []);

  const toggle = useCallback(async (): Promise<void> => {
    if (isLocked) {
      await release();
    } else {
      await request();
    }
  }, [isLocked, release, request]);

  // Auto request on mount if specified
  useEffect(() => {
    if (autoRequest && isSupported) {
      request();
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [autoRequest, isSupported, request]);

  // Re-acquire lock when tab re-enters foreground
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && shouldBeActiveRef.current) {
        await request();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [request]);

  return {
    isSupported,
    isLocked,
    request,
    release,
    toggle,
  };
}
