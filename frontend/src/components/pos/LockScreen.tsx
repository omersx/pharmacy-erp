'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { verifyUserPin, hasUserPin } from '@/lib/offline/crypto';
import { SetPinModal } from './SetPinModal';
import { Lock, Unlock, Delete, RotateCcw, LogOut, KeyRound, ShieldAlert } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import toast from 'react-hot-toast';

interface LockScreenProps {
  isLocked: boolean;
  onUnlock: () => void;
}

export function LockScreen({ isLocked, onUnlock }: LockScreenProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  const [pin, setPin] = useState('');
  const [hasPinConfigured, setHasPinConfigured] = useState<boolean | null>(null);
  const [setPinOpen, setSetPinOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if current user has a PIN configured
  const checkPinSetup = useCallback(async () => {
    if (!user?.id) {
      setHasPinConfigured(false);
      return;
    }
    try {
      const configured = await hasUserPin(user.id);
      setHasPinConfigured(configured);
    } catch {
      setHasPinConfigured(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isLocked) {
      checkPinSetup();
      setPin('');
      setErrorMessage(null);
    }
  }, [isLocked, checkPinSetup]);

  const handleVerify = useCallback(async (pinToTest: string) => {
    if (!user?.id) {
      onUnlock();
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const valid = await verifyUserPin(user.id, pinToTest);
      if (valid) {
        toast.success('🔓 Terminal unlocked', { id: 'unlocked-toast' });
        setPin('');
        onUnlock();
      } else {
        setIsShaking(true);
        setErrorMessage('Incorrect PIN. Please try again.');
        setTimeout(() => {
          setIsShaking(false);
          setPin('');
        }, 600);
      }
    } catch (err: any) {
      setErrorMessage('Verification failed: ' + (err?.message || 'Error'));
    } finally {
      setIsVerifying(false);
    }
  }, [user?.id, onUnlock]);

  const handleDigit = useCallback((digit: string) => {
    if (isVerifying || pin.length >= 6) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMessage(null);

    // Auto-verify if reaches 4 or 6 digits
    if (nextPin.length === 6) {
      handleVerify(nextPin);
    }
  }, [pin, isVerifying, handleVerify]);

  const handleBackspace = useCallback(() => {
    if (isVerifying) return;
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  }, [isVerifying]);

  const handleClear = useCallback(() => {
    if (isVerifying) return;
    setPin('');
    setErrorMessage(null);
  }, [isVerifying]);

  // Physical keyboard support
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (setPinOpen) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length >= 4) {
          handleVerify(pin);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, setPinOpen, pin, handleDigit, handleBackspace, handleClear, handleVerify]);

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm flex flex-col items-center">
        {/* Lock Icon & Pharmacy Title */}
        <div className="w-16 h-16 rounded-3xl bg-pos-500/15 border border-pos-500/30 text-pos-600 dark:text-pos-400 flex items-center justify-center mb-4 shadow-lg shadow-pos-500/10">
          <Lock size={30} className="animate-pulse" />
        </div>

        <h1 className="text-xl font-bold text-foreground tracking-tight">Terminal Locked</h1>
        <p className="text-xs text-foreground/60 mt-1 mb-6">
          Signed in as <span className="font-semibold text-foreground">{user?.full_name || user?.email || 'Cashier'}</span>
        </p>

        {/* PIN Dots Display */}
        <div className={`flex items-center justify-center gap-3 my-4 ${isShaking ? 'animate-bounce' : ''}`}>
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const isFilled = index < pin.length;
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full transition-all duration-150 border-2 ${
                  isFilled
                    ? errorMessage
                      ? 'bg-red-500 border-red-500 scale-110'
                      : 'bg-pos-600 border-pos-600 scale-110 shadow-sm shadow-pos-500/50'
                    : 'bg-surface border-border'
                }`}
              />
            );
          })}
        </div>

        {/* Error or Hint Message */}
        <div className="h-6 mb-2 flex items-center justify-center">
          {errorMessage ? (
            <span className="text-xs font-semibold text-red-500 flex items-center gap-1 animate-in fade-in">
              <ShieldAlert size={14} />
              {errorMessage}
            </span>
          ) : hasPinConfigured === false ? (
            <span className="text-xs text-amber-500 flex items-center gap-1">
              No PIN set. Click below to configure or unlock.
            </span>
          ) : (
            <span className="text-xs text-foreground/40">Enter 4 to 6 digit quick PIN</span>
          )}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px] my-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              disabled={isVerifying}
              className="h-14 rounded-2xl bg-surface border border-border text-foreground hover:bg-surface/70 active:scale-95 text-xl font-bold transition-all shadow-sm flex items-center justify-center"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            disabled={isVerifying || pin.length === 0}
            className="h-14 rounded-2xl bg-surface/50 border border-border/60 text-foreground/60 hover:text-foreground active:scale-95 text-xs font-semibold transition-all flex items-center justify-center"
            title="Clear"
          >
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            disabled={isVerifying}
            className="h-14 rounded-2xl bg-surface border border-border text-foreground hover:bg-surface/70 active:scale-95 text-xl font-bold transition-all shadow-sm flex items-center justify-center"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            disabled={isVerifying || pin.length === 0}
            className="h-14 rounded-2xl bg-surface/50 border border-border/60 text-foreground/60 hover:text-foreground active:scale-95 text-xs font-semibold transition-all flex items-center justify-center"
            title="Backspace"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="w-full max-w-[280px] mt-4 space-y-2">
          {pin.length >= 4 && (
            <button
              type="button"
              onClick={() => handleVerify(pin)}
              disabled={isVerifying}
              className="w-full py-3 px-4 bg-pos-600 hover:bg-pos-700 text-white font-bold rounded-2xl shadow-lg shadow-pos-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Unlock size={16} />
              <span>{isVerifying ? 'Verifying...' : 'Unlock Terminal'}</span>
            </button>
          )}

          {hasPinConfigured === false && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSetPinOpen(true)}
                className="flex-1 py-2 px-3 bg-surface hover:bg-surface/80 border border-border text-foreground text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <KeyRound size={14} className="text-pos-500" />
                <span>Set Terminal PIN</span>
              </button>
              <button
                type="button"
                onClick={onUnlock}
                className="flex-1 py-2 px-3 bg-pos-500/10 hover:bg-pos-500/20 text-pos-600 dark:text-pos-400 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <Unlock size={14} />
                <span>Unlock Now</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border/60 text-xs text-foreground/60">
            <button
              type="button"
              onClick={() => setSetPinOpen(true)}
              className="hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <KeyRound size={13} />
              <span>Change PIN</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.push('/login');
              }}
              className="hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <LogOut size={13} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      <SetPinModal
        open={setPinOpen}
        onClose={() => setSetPinOpen(false)}
        onPinSaved={() => {
          checkPinSetup();
        }}
      />
    </div>
  );
}
