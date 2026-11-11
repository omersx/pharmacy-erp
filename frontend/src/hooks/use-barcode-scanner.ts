'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface BarcodeKeyDebug {
  key: string;
  code: string;
  timeDiff: number;
  currentBuffer: string;
  timestamp: string;
}

interface UseBarcodeOptions {
  /** Callback when a barcode is scanned */
  onScan: (code: string) => void;
  /** Minimum barcode length (default: 3) */
  minLength?: number;
  /** Maximum time between keystrokes in ms (default: 350 for Bluetooth/USB HID latency tolerance) */
  maxDelay?: number;
  /** Whether the scanner is enabled (default: true) */
  enabled?: boolean;
  /** Optional callback for live diagnostic logging of keystrokes */
  onKeyDebug?: (debug: BarcodeKeyDebug) => void;
}

/**
 * Normalizes Eastern Arabic / Persian digits to standard ASCII digits 0-9.
 */
export function normalizeDigits(str: string): string {
  return str
    .replace(/[\u0660-\u0669]/g, (d) => (d.charCodeAt(0) - 0x0660).toString())
    .replace(/[\u06F0-\u06F9]/g, (d) => (d.charCodeAt(0) - 0x06F0).toString())
    .trim();
}

/**
 * Enhanced hook for USB and Bluetooth barcode scanners (HID keyboard emulation).
 * 
 * Features:
 * 1. Global & In-Input capture: Catches scans whether search bar is focused or not.
 * 2. 350ms Bluetooth Latency Tolerance: Prevents wireless connection jitter from dropping the 1st digit.
 * 3. Timer-Based Auto-Submit: Auto-submits even if scanner does NOT send Enter suffix.
 * 4. Fast Terminator Detection: Handles Enter, NumpadEnter, Tab, and CR/LF.
 * 5. Arabic Numeral Normalization: Converts localized numeral keystrokes to ASCII 0-9.
 * 6. Diagnostic Feedback: Exposes live key events for hardware troubleshooting.
 */
export function useBarcodeScanner({
  onScan,
  minLength = 3,
  maxDelay = 350,
  enabled = true,
  onKeyDebug,
}: UseBarcodeOptions) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(Date.now());
  const autoSubmitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onScanRef = useRef(onScan);
  const onKeyDebugRef = useRef(onKeyDebug);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onKeyDebugRef.current = onKeyDebug;
  }, [onKeyDebug]);

  const fireScan = useCallback((rawCode: string) => {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    const cleanCode = normalizeDigits(rawCode);
    bufferRef.current = '';
    if (cleanCode.length >= minLength) {
      onScanRef.current(cleanCode);
    }
  }, [minLength]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore stand-alone modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      const activeEl = document.activeElement as HTMLElement | null;
      const isBarcodeInput = activeEl?.getAttribute('data-barcode-input') === 'true';
      const isOtherInput =
        (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') &&
        !isBarcodeInput;

      // If user is actively typing in a non-barcode input (e.g. modal text field), skip
      if (isOtherInput) {
        bufferRef.current = '';
        if (autoSubmitTimerRef.current) {
          clearTimeout(autoSubmitTimerRef.current);
          autoSubmitTimerRef.current = null;
        }
        return;
      }

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // If too much time passed between characters, reset buffer
      if (timeDiff > maxDelay) {
        bufferRef.current = '';
      }

      // Check for scanner terminator: Enter, NumpadEnter, or Tab
      const isTerminator =
        e.key === 'Enter' ||
        e.key === 'Tab' ||
        e.code === 'NumpadEnter' ||
        e.code === 'Enter';

      if (isTerminator) {
        const bufferedCode = bufferRef.current.trim();
        const inputCode = isBarcodeInput ? (activeEl as HTMLInputElement).value?.trim() : '';
        const finalCode = bufferedCode.length >= minLength ? bufferedCode : inputCode;

        if (finalCode && finalCode.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          fireScan(finalCode);
          return;
        }
      } else if (e.key.length === 1) {
        // Collect normalized character into buffer
        const char = normalizeDigits(e.key) || e.key;
        bufferRef.current += char;

        // Diagnostic callback
        if (onKeyDebugRef.current) {
          onKeyDebugRef.current({
            key: e.key,
            code: e.code,
            timeDiff,
            currentBuffer: bufferRef.current,
            timestamp: new Date().toLocaleTimeString(),
          });
        }

        // Cancel previous auto-submit timer
        if (autoSubmitTimerRef.current) {
          clearTimeout(autoSubmitTimerRef.current);
        }

        // Timer-Based Auto-Submit:
        // If characters arrive quickly and pause for 220ms, auto-trigger scan
        // even if scanner never sends an Enter key!
        autoSubmitTimerRef.current = setTimeout(() => {
          const currentBuffer = bufferRef.current.trim();
          if (currentBuffer.length >= minLength) {
            fireScan(currentBuffer);
          }
        }, 220);
      }
    },
    [minLength, maxDelay, fireScan]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }
    };
  }, [enabled, handleKeyDown]);
}
