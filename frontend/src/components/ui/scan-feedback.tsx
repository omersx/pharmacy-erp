'use client';

import { useCallback, useRef } from 'react';

let sharedAudioCtx: AudioContext | null = null;

/**
 * Safely retrieves and warms up the shared AudioContext.
 * Reuses the context and ensures it is resumed to bypass browser autoplay restrictions.
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return null;

    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtxClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Plays the classic retail/pharmacy barcode scanner beep.
 * High-pitched (2000 Hz), crisp (85ms duration), clean exponential decay with no clicking.
 */
export function playScannerBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2000, now);

    // Smooth envelope: 5ms linear attack to 0.6 volume, 80ms exponential decay
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.6, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  } catch {
    // Audio unsupported or blocked — fail silently
  }
}

/**
 * Plays an error/conflict rejection sound.
 * Low-pitched (250 Hz) buzz to notify user of duplicate or sellability error.
 */
export function playScannerError() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.23);
  } catch {
    // Audio unsupported or blocked — fail silently
  }
}

/**
 * Hook that provides audio and visual feedback for barcode scanning.
 */
export function useScanFeedback() {
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const flashElementRef = useRef<HTMLElement | null>(null);

  /** Play a success beep */
  const playSuccess = useCallback(() => {
    playScannerBeep();
  }, []);

  /** Play an error beep */
  const playError = useCallback(() => {
    playScannerError();
  }, []);

  /**
   * Flash the border of a target element green or red.
   */
  const flashElement = useCallback((color: 'green' | 'red', element?: HTMLElement | null) => {
    const target = element || flashElementRef.current;
    if (!target) return;

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
