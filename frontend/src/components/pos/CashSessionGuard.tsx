'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Store, Loader2, AlertCircle, RefreshCw, Calculator, Banknote, X, History } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/app-store';
import { formatMoney } from '@/lib/utils';
import { CashDenominationsModal } from './CashDenominationsModal';
import { useRouter } from 'next/navigation';

export interface SessionData {
  id: string;
  session_code?: string;
  opening_amount: number;
  opened_at: string;
}

interface CashSessionGuardProps {
  children: (
    session: SessionData,
    openRegisterModal: () => void,
    onSessionClosed: () => void
  ) => React.ReactNode;
}

interface Branch {
  id: string;
  name: string;
}

interface PreviousSession {
  id?: string;
  session_code?: string;
  terminal_name?: string;
  closing_amount?: number;
  closed_at?: string;
}

export function CashSessionGuard({ children }: CashSessionGuardProps) {
  const router = useRouter();
  const currency = useAppStore((state) => (state as any).currency || 'SDG');

  const [session, setSession] = useState<SessionData | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [showOpenModal, setShowOpenModal] = useState<boolean>(false);

  // Open Register state
  const [openingAmount, setOpeningAmount] = useState<string>('0');
  const [openingNotes, setOpeningNotes] = useState<string>('');
  const [terminalName, setTerminalName] = useState<string>('Main Register');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [isOpening, setIsOpening] = useState<boolean>(false);
  const [previousSession, setPreviousSession] = useState<PreviousSession | null>(null);

  // Denominations calculator modal
  const [denominationsOpen, setDenominationsOpen] = useState(false);

  const fetchBranches = async () => {
    try {
      const branchesData: any = await api.getBranches();
      const list = Array.isArray(branchesData) ? branchesData : [];
      setBranches(list);
      if (list.length > 0) {
        setSelectedBranchId(list[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch branches', error);
    }
  };

  const fetchPreviousSession = async (tName = 'Main Register') => {
    try {
      const prev: any = await api.getLastClosedSession({ terminal_name: tName });
      if (prev && prev.closing_amount !== undefined && prev.closing_amount !== null) {
        setPreviousSession(prev);
        // Pre-fill opening cash with previous session's closing amount
        setOpeningAmount(String(Number(prev.closing_amount)));
      }
    } catch (e) {
      console.warn('Could not fetch previous session float', e);
    }
  };

  const checkSession = async () => {
    setLoadingStatus(true);
    setHasError(false);
    try {
      const activeSession: any = await api.getActiveSession();
      if (activeSession && activeSession.id) {
        setSession({
          id: activeSession.id,
          session_code: activeSession.session_code,
          opening_amount: Number(activeSession.opening_amount) || 0,
          opened_at: activeSession.opened_at,
        });
        setShowOpenModal(false);
      } else {
        setSession(null);
        setShowOpenModal(true);
        await fetchBranches();
        await fetchPreviousSession(terminalName);
      }
    } catch (err: any) {
      // 404 means no active open session, which is standard when starting a shift
      setSession(null);
      setShowOpenModal(true);
      await fetchBranches();
      await fetchPreviousSession(terminalName);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const branchId = selectedBranchId || (branches.length > 0 ? branches[0].id : undefined);

    setIsOpening(true);
    try {
      const amount = parseFloat(openingAmount) || 0;
      if (isNaN(amount) || amount < 0) {
        throw new Error('Invalid opening amount');
      }

      const newSession: any = await api.openSession({
        opening_amount: amount,
        terminal_name: terminalName.trim() || 'Main Register',
        branch_id: branchId || undefined,
        opening_notes: openingNotes.trim() ? openingNotes.trim() : undefined,
      });

      toast.success('Cash register opened successfully');
      setSession({
        id: newSession.id,
        session_code: newSession.session_code,
        opening_amount: Number(newSession.opening_amount) || amount,
        opened_at: newSession.opened_at || new Date().toISOString(),
      });
      setShowOpenModal(false);
    } catch (error: any) {
      console.error('Failed to open register', error);
      toast.error(error?.message || 'Failed to open cash register');
    } finally {
      setIsOpening(false);
    }
  };

  const openRegisterModal = () => {
    setShowOpenModal(true);
    fetchBranches();
    fetchPreviousSession(terminalName);
  };

  const handleSessionClosed = () => {
    setSession(null);
    setShowOpenModal(true);
    fetchBranches();
    fetchPreviousSession(terminalName);
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 1. Underlying POS interface (always rendered in background for instant responsiveness) */}
      {children(
        session || { id: '', session_code: '', opening_amount: 0, opened_at: '' },
        openRegisterModal,
        handleSessionClosed
      )}

      {/* 2. Opening Control Modal Overlay (Odoo Parity) */}
      {(showOpenModal || !session) && !loadingStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative my-auto">
            
            {/* Header matching Odoo Opening Control */}
            <div className="p-5 px-6 border-b border-border bg-background/50 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Opening Control</h2>
                <p className="text-xs text-foreground/60 mt-0.5">Enter starting drawer float or count physical cash</p>
              </div>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                title="Discard and exit to Dashboard"
                className="p-1.5 rounded-lg text-foreground/50 hover:text-foreground hover:bg-surface transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenRegister} className="p-6 space-y-4">
              
              {/* Previous Session Float Banner */}
              {previousSession?.closing_amount !== undefined && (
                <div className="p-3 bg-pos-500/10 border border-pos-500/20 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-foreground/80">
                    <History className="w-4 h-4 text-pos-500 shrink-0" />
                    <span>Previous Closing Float:</span>
                  </div>
                  <span className="font-extrabold text-pos-600 dark:text-pos-300">
                    {formatMoney(Number(previousSession.closing_amount), currency)}
                  </span>
                </div>
              )}

              {/* Branch Selector (if multiple) */}
              {branches.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground/60 block">Branch</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Store className="h-4 w-4 text-foreground/40" />
                    </div>
                    <select
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-pos-500"
                    >
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Terminal Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/60 block">Register / Terminal</label>
                <input
                  type="text"
                  value={terminalName}
                  onChange={(e) => {
                    setTerminalName(e.target.value);
                    fetchPreviousSession(e.target.value);
                  }}
                  required
                  className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-pos-500"
                />
              </div>

              {/* Opening Cash Input with Clear [X] and Denominations [💵] Calculator */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold uppercase tracking-wider text-foreground block">
                    Opening cash
                  </label>
                  {openingAmount && parseFloat(openingAmount) > 0 && (
                    <span className="text-xs text-pos-600 dark:text-pos-300 font-semibold">
                      {formatMoney(parseFloat(openingAmount) || 0, currency)}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <DollarSign className="h-4 w-4 text-foreground/40" />
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={openingAmount}
                      onChange={(e) => setOpeningAmount(e.target.value)}
                      required
                      className="w-full pl-9 pr-9 py-2.5 bg-background border border-border rounded-xl text-foreground text-sm font-bold focus:outline-none focus:ring-2 focus:ring-pos-500"
                      placeholder="0.00"
                    />
                    {openingAmount && openingAmount !== '0' && (
                      <button
                        type="button"
                        onClick={() => setOpeningAmount('0')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-foreground/40 hover:text-foreground"
                        title="Clear amount"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Denomination Counter Button matching Odoo [💵] icon */}
                  <button
                    type="button"
                    onClick={() => setDenominationsOpen(true)}
                    className="px-3.5 py-2.5 bg-surface border border-border hover:bg-background hover:border-pos-500/50 text-foreground rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                    title="Count Coins & Banknotes"
                  >
                    <Banknote className="w-4 h-4 text-emerald-500" />
                    <span className="hidden sm:inline text-xs">Count</span>
                  </button>
                </div>
              </div>

              {/* Opening Note Textarea matching Odoo Screenshot 1 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/60 block">
                  Opening note
                </label>
                <textarea
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  rows={2}
                  placeholder="Add an opening note..."
                  className="w-full px-3.5 py-2 bg-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-pos-500 resize-none placeholder:text-foreground/40"
                />
              </div>

              {/* Action Buttons matching Odoo Screenshot 1: [Open Register] (purple) & [Discard] */}
              <div className="pt-2 flex gap-3">
                <button
                  type="submit"
                  disabled={isOpening}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#714B67] hover:bg-[#5E3E56] text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-[#714B67]/20 disabled:opacity-60"
                >
                  {isOpening ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Open Register
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  disabled={isOpening}
                  className="py-2.5 px-5 bg-surface border border-border hover:bg-background text-foreground rounded-xl text-sm font-semibold transition-colors"
                >
                  Discard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Denominations Counting Dialog */}
      <CashDenominationsModal
        open={denominationsOpen}
        onClose={() => setDenominationsOpen(false)}
        initialTotal={parseFloat(openingAmount) || 0}
        onConfirm={(calcTotal, breakdownNote) => {
          setOpeningAmount(String(calcTotal));
          if (breakdownNote) {
            setOpeningNotes((prev) => (prev ? `${prev} | ${breakdownNote}` : breakdownNote));
          }
        }}
      />
    </div>
  );
}
