'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { useAppStore } from '@/store/app-store';
import { format } from 'date-fns';
import {
  ShieldAlert, AlertTriangle, ShieldCheck, Trash2, RefreshCw,
  Search, Filter, CheckCircle2, AlertCircle, DollarSign,
  Clock, X, ArrowRight, ShieldX, Undo2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';

interface ExpiryBatch {
  batch_id: string;
  batch_number: string;
  medicine_id: string;
  medicine_name: string;
  medicine_sku: string;
  branch_id?: string;
  branch_name?: string;
  expiry_date: string;
  days_to_expiry: number;
  quantity_remaining: number;
  purchase_price: number;
  total_value_at_risk: number;
  status: 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED' | 'QUARANTINED' | 'RECALLED' | 'DISPOSED';
  notes?: string;
  bucket: string;
}

interface ExpirySummary {
  count_0_30: number;
  value_0_30: number;
  count_31_60: number;
  value_31_60: number;
  count_61_90: number;
  value_61_90: number;
  count_expired: number;
  value_expired: number;
  count_quarantined: number;
  value_quarantined: number;
  count_recalled: number;
  value_recalled: number;
  total_batches_at_risk: number;
  total_value_at_risk: number;
}

export function ExpiryCenter() {
  const { currency } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<ExpiryBatch[]>([]);
  const [summary, setSummary] = useState<ExpirySummary | null>(null);
  const [bucketFilter, setBucketFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  // Action Modal State
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ExpiryBatch | null>(null);
  const [actionType, setActionType] = useState<'QUARANTINED' | 'RECALLED' | 'ACTIVE' | 'DISPOSED'>('QUARANTINED');
  const [actionReason, setActionReason] = useState('');
  const [actionReference, setActionReference] = useState('');
  const [disposeQty, setDisposeQty] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchExpiryData();
  }, [bucketFilter]);

  const fetchExpiryData = async () => {
    setLoading(true);
    try {
      const data: any = await api.getExpiryDashboard({ bucket_filter: bucketFilter });
      setSummary(data.summary);
      setBatches(Array.isArray(data.batches) ? data.batches : []);
    } catch (err) {
      toast.error('Failed to load expiry control center data');
    } finally {
      setLoading(false);
    }
  };

  const openActionModal = (batch: ExpiryBatch, type: 'QUARANTINED' | 'RECALLED' | 'ACTIVE' | 'DISPOSED') => {
    setSelectedBatch(batch);
    setActionType(type);
    setActionReason('');
    setActionReference('');
    setDisposeQty(String(batch.quantity_remaining));
    setActionModalOpen(true);
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    if (!actionReason.trim()) {
      toast.error('Please provide a reason / audit justification');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        status: actionType,
        reason: actionReason.trim(),
        reference: actionReference.trim() || undefined,
      };

      if (actionType === 'DISPOSED') {
        const qty = parseFloat(disposeQty);
        if (isNaN(qty) || qty <= 0) {
          toast.error('Please enter a valid positive quantity to dispose');
          setSubmitting(false);
          return;
        }
        payload.quantity_to_dispose = qty;
      }

      await api.updateBatchStatus(selectedBatch.batch_id, payload);
      toast.success(`Successfully updated batch ${selectedBatch.batch_number}`);
      setActionModalOpen(false);
      fetchExpiryData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update batch status');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBatches = batches.filter(b => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.medicine_name.toLowerCase().includes(q) ||
      b.batch_number.toLowerCase().includes(q) ||
      b.medicine_sku.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      
      {/* ── Metric Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* 0-30 Days */}
        <div 
          onClick={() => setBucketFilter(bucketFilter === '0_30' ? 'ALL' : '0_30')}
          className={cn(
            "rounded-xl border p-4 cursor-pointer transition-all shadow-sm",
            bucketFilter === '0_30' 
              ? "bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/20" 
              : "bg-surface border-border hover:border-border/80"
          )}
        >
          <div className="flex items-center justify-between text-rose-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">0–30 Days (Urgent)</span>
            <AlertTriangle size={16} />
          </div>
          <p className="text-2xl font-black text-rose-500">
            {summary?.count_0_30 || 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Valuation: <strong className="text-foreground">{currency} {Number(summary?.value_0_30 || 0).toFixed(2)}</strong>
          </p>
        </div>

        {/* 31-60 Days */}
        <div 
          onClick={() => setBucketFilter(bucketFilter === '31_60' ? 'ALL' : '31_60')}
          className={cn(
            "rounded-xl border p-4 cursor-pointer transition-all shadow-sm",
            bucketFilter === '31_60' 
              ? "bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20" 
              : "bg-surface border-border hover:border-border/80"
          )}
        >
          <div className="flex items-center justify-between text-amber-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">31–60 Days</span>
            <Clock size={16} />
          </div>
          <p className="text-2xl font-black text-amber-500">
            {summary?.count_31_60 || 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Valuation: <strong className="text-foreground">{currency} {Number(summary?.value_31_60 || 0).toFixed(2)}</strong>
          </p>
        </div>

        {/* 61-90 Days */}
        <div 
          onClick={() => setBucketFilter(bucketFilter === '61_90' ? 'ALL' : '61_90')}
          className={cn(
            "rounded-xl border p-4 cursor-pointer transition-all shadow-sm",
            bucketFilter === '61_90' 
              ? "bg-yellow-500/10 border-yellow-500 ring-2 ring-yellow-500/20" 
              : "bg-surface border-border hover:border-border/80"
          )}
        >
          <div className="flex items-center justify-between text-yellow-600 dark:text-yellow-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">61–90 Days</span>
            <Clock size={16} />
          </div>
          <p className="text-2xl font-black text-yellow-600 dark:text-yellow-400">
            {summary?.count_61_90 || 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Valuation: <strong className="text-foreground">{currency} {Number(summary?.value_61_90 || 0).toFixed(2)}</strong>
          </p>
        </div>

        {/* Expired */}
        <div 
          onClick={() => setBucketFilter(bucketFilter === 'EXPIRED' ? 'ALL' : 'EXPIRED')}
          className={cn(
            "rounded-xl border p-4 cursor-pointer transition-all shadow-sm",
            bucketFilter === 'EXPIRED' 
              ? "bg-red-600/10 border-red-600 ring-2 ring-red-600/20" 
              : "bg-surface border-border hover:border-border/80"
          )}
        >
          <div className="flex items-center justify-between text-red-600 dark:text-red-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Expired (Blocked)</span>
            <ShieldX size={16} />
          </div>
          <p className="text-2xl font-black text-red-600 dark:text-red-400">
            {summary?.count_expired || 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Write-off Risk: <strong className="text-foreground">{currency} {Number(summary?.value_expired || 0).toFixed(2)}</strong>
          </p>
        </div>

        {/* Quarantined & Recalled */}
        <div 
          onClick={() => setBucketFilter(bucketFilter === 'QUARANTINED' ? 'ALL' : 'QUARANTINED')}
          className={cn(
            "rounded-xl border p-4 cursor-pointer transition-all shadow-sm",
            bucketFilter === 'QUARANTINED' 
              ? "bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/20" 
              : "bg-surface border-border hover:border-border/80"
          )}
        >
          <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Quarantine & Recall</span>
            <ShieldAlert size={16} />
          </div>
          <p className="text-2xl font-black text-purple-600 dark:text-purple-400">
            {(summary?.count_quarantined || 0) + (summary?.count_recalled || 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Isolated: <strong className="text-foreground">{currency} {((Number(summary?.value_quarantined || 0)) + (Number(summary?.value_recalled || 0))).toFixed(2)}</strong>
          </p>
        </div>

      </div>

      {/* ── Table Filter Toolbar ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Bucket Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-background border border-border rounded-xl">
          {[
            { id: 'ALL', label: 'All At-Risk' },
            { id: '0_30', label: '0–30d Urgent' },
            { id: '31_60', label: '31–60d' },
            { id: '61_90', label: '61–90d' },
            { id: 'EXPIRED', label: 'Expired' },
            { id: 'QUARANTINED', label: 'Quarantined' },
            { id: 'RECALLED', label: 'Recalled' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setBucketFilter(f.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                bucketFilter === f.id
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search medicine or batch #..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 text-foreground"
          />
        </div>
      </div>

      {/* ── Batches Table ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">Medicine</th>
                <th className="px-6 py-4 font-semibold">Batch Number</th>
                <th className="px-6 py-4 font-semibold">Expiry Date</th>
                <th className="px-6 py-4 font-semibold text-center">Remaining Stock</th>
                <th className="px-6 py-4 font-semibold text-right">Cost Value</th>
                <th className="px-6 py-4 font-semibold text-center">Batch Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-500" />
                    Analyzing expiry schedules & quarantine status...
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3 opacity-60" />
                    <p className="font-semibold text-foreground">No at-risk batches found</p>
                    <p className="text-xs mt-1">All batches in this filter are healthy and within safe shelf-life limits.</p>
                  </td>
                </tr>
              ) : (
                filteredBatches.map(b => {
                  const isExpired = b.days_to_expiry < 0;
                  const isQuarantined = b.status === 'QUARANTINED';
                  const isRecalled = b.status === 'RECALLED';
                  const isDisposed = b.status === 'DISPOSED';

                  return (
                    <tr key={b.batch_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      
                      {/* Medicine */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-foreground">{b.medicine_name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{b.medicine_sku}</div>
                      </td>

                      {/* Batch # */}
                      <td className="px-6 py-4">
                        <span className="font-mono bg-background px-2 py-1 rounded-md border border-border text-xs font-semibold">
                          {b.batch_number}
                        </span>
                      </td>

                      {/* Expiry Date & Days Left Badge */}
                      <td className="px-6 py-4">
                        <div className="text-xs text-foreground font-medium">
                          {b.expiry_date ? format(new Date(b.expiry_date), 'MMM dd, yyyy') : '-'}
                        </div>
                        <div className="mt-1">
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-500">
                              <AlertCircle size={12} /> Expired {Math.abs(b.days_to_expiry)} days ago
                            </span>
                          ) : b.days_to_expiry <= 30 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500">
                              <AlertTriangle size={12} /> Expires in {b.days_to_expiry} days
                            </span>
                          ) : b.days_to_expiry <= 60 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-500">
                              <Clock size={12} /> Expires in {b.days_to_expiry} days
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-yellow-600 dark:text-yellow-400">
                              <Clock size={12} /> {b.days_to_expiry} days left
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Remaining Stock */}
                      <td className="px-6 py-4 text-center font-bold text-foreground">
                        {b.quantity_remaining}
                      </td>

                      {/* Cost Valuation */}
                      <td className="px-6 py-4 text-right">
                        <div className="font-bold text-foreground">
                          {currency} {Number(b.total_value_at_risk).toFixed(2)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          @{currency} {Number(b.purchase_price).toFixed(2)}/unit
                        </div>
                      </td>

                      {/* Batch Status Badge */}
                      <td className="px-6 py-4 text-center">
                        {isRecalled ? (
                          <Badge variant="danger" className="uppercase gap-1">
                            <ShieldAlert size={12} /> Recalled
                          </Badge>
                        ) : isQuarantined ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            <ShieldAlert size={12} /> Quarantined
                          </span>
                        ) : isExpired ? (
                          <Badge variant="danger" className="uppercase">
                            Expired
                          </Badge>
                        ) : b.status === 'NEAR_EXPIRY' ? (
                          <Badge variant="warning" className="uppercase">
                            Near Expiry
                          </Badge>
                        ) : isDisposed ? (
                          <Badge variant="default" className="uppercase">
                            Disposed
                          </Badge>
                        ) : (
                          <Badge variant="success" className="uppercase">
                            Active
                          </Badge>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {/* If Quarantined: Offer Release or Dispose */}
                          {isQuarantined && (
                            <>
                              <button
                                onClick={() => openActionModal(b, 'ACTIVE')}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors flex items-center gap-1"
                                title="Release back to active stock"
                              >
                                <Undo2 size={12} /> Release
                              </button>
                              <button
                                onClick={() => openActionModal(b, 'DISPOSED')}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/30 transition-colors flex items-center gap-1"
                                title="Write off and dispose"
                              >
                                <Trash2 size={12} /> Dispose
                              </button>
                            </>
                          )}

                          {/* If Recalled: Offer Dispose */}
                          {isRecalled && (
                            <button
                              onClick={() => openActionModal(b, 'DISPOSED')}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/30 transition-colors flex items-center gap-1"
                              title="Write off recalled stock"
                            >
                              <Trash2 size={12} /> Dispose
                            </button>
                          )}

                          {/* If Expired: Offer Direct Disposal Write-off */}
                          {!isQuarantined && !isRecalled && isExpired && (
                            <button
                              onClick={() => openActionModal(b, 'DISPOSED')}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-500 hover:bg-red-600 text-white transition-all flex items-center gap-1 shadow-sm"
                            >
                              <Trash2 size={12} /> Write-Off Expiry
                            </button>
                          )}

                          {/* If Active / Near Expiry: Offer Quarantine or Recall */}
                          {!isQuarantined && !isRecalled && !isExpired && (
                            <>
                              <button
                                onClick={() => openActionModal(b, 'QUARANTINED')}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border border-purple-500/30 transition-colors flex items-center gap-1"
                                title="Isolate and hold batch"
                              >
                                <ShieldAlert size={12} /> Quarantine
                              </button>
                              <button
                                onClick={() => openActionModal(b, 'RECALLED')}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center gap-1"
                                title="Manufacturer / MOH Recall"
                              >
                                <ShieldX size={12} /> Recall
                              </button>
                            </>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Action Dialog (Quarantine / Recall / Release / Dispose) ───── */}
      <Dialog.Root open={actionModalOpen} onOpenChange={setActionModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in-0 duration-200" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-in zoom-in-95 duration-200">
            
            {selectedBatch && (
              <form onSubmit={handleActionSubmit}>
                {/* Header */}
                <div className="p-6 border-b border-border bg-background/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      actionType === 'QUARANTINED' ? "bg-purple-500/10 text-purple-500" :
                      actionType === 'RECALLED' ? "bg-rose-500/10 text-rose-500" :
                      actionType === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-500" :
                      "bg-red-500/10 text-red-500"
                    )}>
                      {actionType === 'QUARANTINED' && <ShieldAlert size={20} />}
                      {actionType === 'RECALLED' && <ShieldX size={20} />}
                      {actionType === 'ACTIVE' && <ShieldCheck size={20} />}
                      {actionType === 'DISPOSED' && <Trash2 size={20} />}
                    </div>
                    <div>
                      <Dialog.Title className="text-lg font-bold text-foreground">
                        {actionType === 'QUARANTINED' && 'Quarantine Batch'}
                        {actionType === 'RECALLED' && 'Official Recall Notice'}
                        {actionType === 'ACTIVE' && 'Release to Active Stock'}
                        {actionType === 'DISPOSED' && 'Write-Off & Safe Disposal'}
                      </Dialog.Title>
                      <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
                        Batch {selectedBatch.batch_number} • {selectedBatch.medicine_name}
                      </Dialog.Description>
                    </div>
                  </div>
                  <Dialog.Close asChild>
                    <button className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                  
                  {/* Informational Callout */}
                  <div className={cn(
                    "p-3 rounded-xl border text-xs flex items-start gap-2.5",
                    actionType === 'QUARANTINED' ? "bg-purple-500/5 border-purple-500/20 text-purple-600 dark:text-purple-400" :
                    actionType === 'RECALLED' ? "bg-rose-500/5 border-rose-500/20 text-rose-600 dark:text-rose-400" :
                    actionType === 'ACTIVE' ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" :
                    "bg-red-500/5 border-red-500/20 text-red-600 dark:text-red-400"
                  )}>
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <div>
                      {actionType === 'QUARANTINED' && 'Quarantining this batch immediately blocks it from FEFO dispatching, POS search, and sales transactions until cleared.'}
                      {actionType === 'RECALLED' && 'Recalling marks this batch as officially hazardous/compromised. Cannot be dispensed or transferred.'}
                      {actionType === 'ACTIVE' && 'Releasing this batch will restore it to the sellable inventory pool (if not expired).'}
                      {actionType === 'DISPOSED' && 'Disposal permanently removes the selected units from stock and creates an audit write-off entry.'}
                    </div>
                  </div>

                  {/* Batch Summary */}
                  <div className="grid grid-cols-2 gap-3 p-3 bg-background rounded-xl border border-border text-xs">
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Current Stock</span>
                      <strong className="text-foreground text-sm">{selectedBatch.quantity_remaining} units</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Total Valuation</span>
                      <strong className="text-foreground text-sm">{currency} {Number(selectedBatch.total_value_at_risk).toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* Quantity to dispose (only if DISPOSED) */}
                  {actionType === 'DISPOSED' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-foreground">
                        Quantity to Dispose (Max {selectedBatch.quantity_remaining})
                      </label>
                      <input 
                        type="number"
                        min="1"
                        max={selectedBatch.quantity_remaining}
                        step="any"
                        value={disposeQty}
                        onChange={(e) => setDisposeQty(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-xl text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500"
                        required
                      />
                    </div>
                  )}

                  {/* Reference # */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground">
                      Reference / Circular # (Optional)
                    </label>
                    <input 
                      type="text"
                      placeholder="e.g. MOH-CIRCULAR-409, LAB-INSPECTION-12..."
                      value={actionReference}
                      onChange={(e) => setActionReference(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  {/* Reason / Audit Justification */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground">
                      Audit Reason & Pharmacist Explanation <span className="text-red-500">*</span>
                    </label>
                    <textarea 
                      rows={3}
                      placeholder="Detailed explanation of the defect, temperature excursion, or official instruction..."
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                      required
                    />
                  </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-border bg-background/50 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setActionModalOpen(false)}
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    className={cn(
                      "px-6 py-2 text-xs font-bold rounded-xl text-white shadow-sm transition-all flex items-center gap-1.5",
                      actionType === 'QUARANTINED' ? "bg-purple-600 hover:bg-purple-700 shadow-purple-600/20" :
                      actionType === 'RECALLED' ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20" :
                      actionType === 'ACTIVE' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20" :
                      "bg-red-600 hover:bg-red-700 shadow-red-600/20"
                    )}
                  >
                    {submitting ? (
                      <><RefreshCw size={14} className="animate-spin" /> Processing...</>
                    ) : (
                      <>Confirm Action</>
                    )}
                  </button>
                </div>
              </form>
            )}

          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </div>
  );
}
