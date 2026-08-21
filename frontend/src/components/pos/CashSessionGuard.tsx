'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Store, Loader2, AlertCircle, RefreshCw, Calculator } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api';
import { usePaymentMethodsStore } from '@/store/payment-methods-store';

interface SessionData {
  id: string;
  opening_amount: number;
  opened_at: string;
}

interface CashSessionGuardProps {
  children: (session: SessionData) => React.ReactNode;
}

interface Branch {
  id: string;
  name: string;
}

export function CashSessionGuard({ children }: CashSessionGuardProps) {
  const { requireCashSession } = usePaymentMethodsStore();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  // Open Register state
  const [openingAmount, setOpeningAmount] = useState<string>('0');
  const [terminalName, setTerminalName] = useState<string>('POS Terminal 1');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [isOpening, setIsOpening] = useState<boolean>(false);

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

  const checkSession = async () => {
    setLoadingStatus(true);
    setHasError(false);
    try {
      const activeSession: any = await api.getActiveSession();
      if (activeSession && activeSession.id) {
        setSession({
          id: activeSession.id,
          opening_amount: Number(activeSession.opening_amount) || 0,
          opened_at: activeSession.opened_at,
        });
      } else {
        await fetchBranches();
      }
    } catch (err: any) {
      // 404 or any "no active session" error is expected when register is closed
      if (
        err?.status === 404 ||
        err?.response?.status === 404 ||
        err?.message?.toLowerCase().includes('not found') ||
        err?.message?.toLowerCase().includes('no active session') ||
        err?.message?.includes('404')
      ) {
        await fetchBranches();
      } else {
        console.error('Unexpected error checking cash session:', err);
        // Only show hard error if cash session is strictly required
        if (requireCashSession) {
          setHasError(true);
        } else {
          await fetchBranches();
        }
      }
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const branchId = selectedBranchId || (branches.length > 0 ? branches[0].id : '');
    if (!branchId) {
      toast.error('Please select a branch');
      return;
    }

    setIsOpening(true);
    try {
      const amount = parseFloat(openingAmount) || 0;
      if (isNaN(amount) || amount < 0) {
        throw new Error('Invalid opening amount');
      }

      const newSession: any = await api.openSession({
        opening_amount: amount,
        terminal_name: terminalName.trim() || 'POS Terminal 1',
        branch_id: branchId,
      });

      toast.success('Cash register opened successfully');
      setSession({
        id: newSession.id,
        opening_amount: Number(newSession.opening_amount) || amount,
        opened_at: newSession.opened_at || new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Failed to open register', error);
      toast.error(error?.message || 'Failed to open cash register');
    } finally {
      setIsOpening(false);
    }
  };

  // If cash session is NOT required by settings, bypass the guard screen and render POS directly!
  if (!requireCashSession) {
    return <>{children(session || { id: '', opening_amount: 0, opened_at: '' })}</>;
  }

  if (loadingStatus) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[500px] w-full bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-pos-500 mb-4" />
        <p className="text-foreground/70">Checking register status...</p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[500px] w-full bg-background p-4">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Connection Error</h2>
        <p className="text-foreground/70 mb-6 text-center max-w-md text-sm">
          Unable to verify cash register status from the server.
        </p>
        <div className="flex gap-3">
          <button
            onClick={checkSession}
            className="flex items-center gap-2 px-4 py-2 bg-pos-500 hover:bg-pos-600 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
          <button
            onClick={() => {
              setHasError(false);
              fetchBranches();
            }}
            className="px-4 py-2 bg-surface border border-border hover:bg-background text-foreground rounded-lg transition-colors text-sm font-medium"
          >
            Open Register Manually
          </button>
        </div>
      </div>
    );
  }

  if (session) {
    return <>{children(session)}</>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6 bg-pos-500/10 border-b border-border text-center">
          <div className="w-14 h-14 bg-pos-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-pos-500/20">
            <Calculator className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Open Cash Register</h2>
          <p className="text-sm text-foreground/60 mt-1">Start your shift by entering the opening float</p>
        </div>

        <form onSubmit={handleOpenRegister} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground/60 block">Branch</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Store className="h-4 w-4 text-foreground/40" />
              </div>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                required
                className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-pos-500"
              >
                {branches.length === 0 ? (
                  <option value="" disabled>Loading branches...</option>
                ) : (
                  branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground/60 block">Terminal Name</label>
            <input
              type="text"
              value={terminalName}
              onChange={(e) => setTerminalName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-pos-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-foreground/60 block">Opening Cash Amount</label>
            <div className="relative">
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
                className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-pos-500"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={isOpening}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-pos-500 hover:bg-pos-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-pos-500/20 disabled:opacity-60"
            >
              {isOpening ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              Open Register & Start Shift
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
