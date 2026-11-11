'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/store/auth-store';
import { setUserPin } from '@/lib/offline/crypto';
import { KeyRound, Check, X, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

interface SetPinModalProps {
  open: boolean;
  onClose: () => void;
  onPinSaved?: () => void;
}

export function SetPinModal({ open, onClose, onPinSaved }: SetPinModalProps) {
  const user = useAuthStore((s) => s.user);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user?.id) {
      setError('Active user required to set terminal PIN');
      return;
    }

    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4 to 6 numeric digits');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    try {
      setIsSaving(true);
      await setUserPin(user.id, pin);
      toast.success('🔒 Terminal PIN successfully set', { id: 'pin-saved' });
      setPin('');
      setConfirmPin('');
      onPinSaved?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save PIN');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-pos-500/10 text-pos-600 dark:text-pos-400 rounded-xl">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-base">Terminal Quick PIN</h3>
              <p className="text-xs text-foreground/60">Fast unlock for POS counter</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-foreground/40 hover:text-foreground rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-foreground/70 mb-1.5">
              Enter 4–6 Digit PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full text-center tracking-[0.5em] text-2xl font-bold py-2.5 bg-surface border border-border rounded-xl focus:outline-none focus:border-pos-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground/70 mb-1.5">
              Confirm PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full text-center tracking-[0.5em] text-2xl font-bold py-2.5 bg-surface border border-border rounded-xl focus:outline-none focus:border-pos-500"
            />
          </div>

          <div className="p-3 bg-surface/80 rounded-xl border border-border/60 text-xs text-foreground/60 flex items-start gap-2">
            <ShieldCheck size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            <span>
              Your PIN is secured locally using PBKDF2 with 600,000 iterations. It unlocks your register quickly even when completely offline.
            </span>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 text-xs font-semibold text-foreground/70 hover:text-foreground bg-surface hover:bg-surface/80 border border-border rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || pin.length < 4 || pin !== confirmPin}
              className="flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-pos-600 hover:bg-pos-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <Check size={15} />
              <span>{isSaving ? 'Saving...' : 'Set PIN'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
