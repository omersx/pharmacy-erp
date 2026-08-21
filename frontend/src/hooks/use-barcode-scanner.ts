'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UseBarcodeOptions {
  /** Callback when a barcode is scanned */
  onScan: (code: string) => void;
  /** Minimum barcode length (default: 3) */
  minLength?: number;
  /** Maximum time between keystrokes in ms (default: 80) */
  maxDelay?: number;
  /** Whether the scanner is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Custom hook that detects USB/Bluetooth barcode scanner input.
 * 
 * Hardware barcode scanners work like fast keyboards — they type characters
 * very quickly (under 50ms between keystrokes) and end with Enter.
 * This hook detects that pattern and fires `onScan` with the scanned code.
 * 
 * @example
 * ```tsx
 * useBarcodeScanner({
 *   onScan: (code) => {
 *     console.log('Scanned:', code);
 *     // Look up product by barcode and add to cart
 *   },
 * });
 * ```
 */
export function useBarcodeScanner({
  onScan,
  minLength = 3,
  maxDelay = 80,
  enabled = true,
}: UseBarcodeOptions) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(Date.now());
  const onScanRef = useRef(onScan);

  // Keep callback ref updated without re-registering the listener
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if focused on an input/textarea (let the input handle it)
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputActive = activeTag === 'input' || activeTag === 'textarea';

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Reset buffer if too much time has passed between keystrokes
      if (timeDiff > maxDelay) {
        bufferRef.current = '';
      }

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        if (code.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          bufferRef.current = '';
          onScanRef.current(code);
        }
      } else if (e.key.length === 1 && !isInputActive) {
        bufferRef.current += e.key;
      }
    },
    [minLength, maxDelay]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [enabled, handleKeyDown]);
}
