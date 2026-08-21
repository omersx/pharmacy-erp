'use client';

import { useCallback, useRef } from 'react';

const BEEP_DURATION = 150;
const BEEP_VOLUME = 0.3;

/**
 * Creates a beep sound using the Web Audio API.
 * No external audio files needed — works everywhere.
 */
function createBeep(frequency: number, duration: number, volume: number) {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.value = volume;

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration / 1000);

    // Clean up
    oscillator.onended = () => audioCtx.close();
  } catch {
    // Audio not supported — fail silently
  }
}

/**
 * Hook that provides audio and visual feedback for barcode scanning.
 * 
 * @example
 * ```tsx
 * const { playSuccess, playError, flashElement } = useScanFeedback();
 * 
 * // On successful scan
 * playSuccess();
 * flashElement('green');
 * 
 * // On failed scan
 * playError();
 * flashElement('red');
 * ```
 */
export function useScanFeedback() {
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flashElementRef = useRef<HTMLElement | null>(null);

  /** Play a success beep (high pitch) */
  const playSuccess = useCallback(() => {
    createBeep(1200, BEEP_DURATION, BEEP_VOLUME);
    // Double beep for success
    setTimeout(() => createBeep(1500, BEEP_DURATION, BEEP_VOLUME), 100);
  }, []);

  /** Play an error beep (low pitch) */
  const playError = useCallback(() => {
    createBeep(300, 300, BEEP_VOLUME);
  }, []);

  /**
   * Flash the border of a target element green or red.
   * Pass the element directly or use the ref returned by `getFlashRef`.
   */
  const flashElement = useCallback((color: 'green' | 'red', element?: HTMLElement | null) => {
    const target = element || flashElementRef.current;
    if (!target) return;

    // Clear any existing flash
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }

    const borderColor = color === 'green' ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';
    const shadowColor = color === 'green' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';

    target.style.transition = 'box-shadow 0.15s ease-in, border-color 0.15s ease-in';
    target.style.borderColor = borderColor;
    target.style.boxShadow = `0 0 0 3px ${shadowColor}`;

    flashTimeoutRef.current = setTimeout(() => {
      target.style.borderColor = '';
      target.style.boxShadow = '';
      target.style.transition = '';
    }, 600);
  }, []);

  return {
    playSuccess,
    playError,
    flashElement,
    flashElementRef,
  };
}
