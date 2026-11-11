'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { db, type OutboxSale } from '@/lib/offline/db';
import { getStorageHealth, requestPersistentStorage, type StorageHealth } from '@/lib/offline/storage';
import { getDeviceId, runSync } from '@/lib/offline/sync';
import { syncCatalog, clearCatalogCache } from '@/lib/offline/catalog-sync';
import { isReachable } from '@/lib/offline/reachability';
import { formatMoney } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import {
  Activity,
  HardDrive,
  Database,
  Smartphone,
  RefreshCw,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  X,
  Wifi,
  WifiOff,
  Clock,
  ShieldCheck,
  FileJson,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface TerminalDiagnosticsModalProps {
  open: boolean;
  onClose: () => void;
  branchId?: string;
}

export function TerminalDiagnosticsModal({
  open,
  onClose,
  branchId,
}: TerminalDiagnosticsModalProps) {
  const { currency } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [deviceId, setDeviceId] = useState<string>('');
  const [copiedDevice, setCopiedDevice] = useState(false);
  const [storage, setStorage] = useState<StorageHealth | null>(null);

  // Counts
  const [medicineCount, setMedicineCount] = useState<number>(0);
  const [batchCount, setBatchCount] = useState<number>(0);
  const [outboxCounts, setOutboxCounts] = useState({
    total: 0,
    pending: 0,
    failed: 0,
    needsReview: 0,
    synced: 0,
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Outbox entries
  const [outboxItems, setOutboxItems] = useState<OutboxSale[]>([]);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [online, devId, storeHealth, medCount, bCount, outboxList, syncMeta] =
        await Promise.all([
          isReachable(),
          getDeviceId(),
          getStorageHealth(),
          db.medicines.count(),
          db.batches.count(),
          db.outbox.orderBy('createdAtDevice').reverse().limit(50).toArray(),
          db.meta.get('catalog_last_synced'),
        ]);

      setIsOnline(online);
      setDeviceId(devId);
      setStorage(storeHealth);
      setMedicineCount(medCount);
      setBatchCount(bCount);
      setOutboxItems(outboxList);
      setLastSyncedAt(syncMeta?.value ? String(syncMeta.value) : null);

      // Aggregate outbox status counts
      let pending = 0;
      let failed = 0;
      let needsReview = 0;
      let synced = 0;
      for (const item of outboxList) {
        if (item.status === 'pending' || item.status === 'syncing') pending++;
        else if (item.status === 'failed') failed++;
        else if (item.status === 'needs_review') needsReview++;
        else if (item.status === 'synced') synced++;
      }
      setOutboxCounts({
        total: outboxList.length,
        pending,
        failed,
        needsReview,
        synced,
      });
    } catch (err) {
      console.error('[TerminalDiagnostics] Error loading status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  const handleCopyDeviceId = () => {
    if (!deviceId) return;
    navigator.clipboard.writeText(deviceId);
    setCopiedDevice(true);
    toast.success('Device ID copied to clipboard');
    setTimeout(() => setCopiedDevice(false), 2000);
  };

  const handleRequestPersistence = async () => {
    setActionInProgress('persist');
    try {
      const granted = await requestPersistentStorage();
      if (granted) {
        toast.success('Storage persistence granted by browser');
      } else {
        toast('Browser did not grant persistent storage', { icon: 'ℹ️' });
      }
      const updatedHealth = await getStorageHealth();
      setStorage(updatedHealth);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleTriggerSync = async () => {
    setActionInProgress('sync');
    try {
      const res = await runSync();
      toast.success(
        `Sync completed: ${res.syncedCount} synced, ${res.pendingCount} pending`
      );
      await loadData();
    } catch (err: any) {
      toast.error(`Sync failed: ${err.message || 'Network error'}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleForceDelta = async () => {
    setActionInProgress('delta');
    try {
      const ok = await syncCatalog(branchId);
      if (ok) {
        toast.success('Incremental catalog sync completed');
        await loadData();
      } else {
        toast.error('Incremental sync failed');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  const handleForceBootstrap = async () => {
    setActionInProgress('bootstrap');
    try {
      const ok = await syncCatalog(branchId, { forceBootstrap: true });
      if (ok) {
        toast.success('Full catalog snapshot reloaded successfully');
        await loadData();
      } else {
        toast.error('Full catalog snapshot failed');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Are you sure you want to purge local catalog cache? Data will re-download on next sync.')) {
      return;
    }
    setActionInProgress('clear');
    try {
      await clearCatalogCache();
      toast.success('Local catalog cache cleared');
      await loadData();
    } catch (err: any) {
      toast.error('Failed to clear cache');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleExportOutboxJson = () => {
    if (outboxItems.length === 0) {
      toast('No outbox records to export', { icon: 'ℹ️' });
      return;
    }

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      deviceId,
      branchId,
      totalCount: outboxItems.length,
      sales: outboxItems,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmacy-offline-sales-${deviceId.slice(0, 8)}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${outboxItems.length} transactions as JSON`, {
      id: 'export-toast',
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-pos-500/10 text-pos-600 dark:text-pos-400 rounded-xl">
              <Activity size={22} />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-base sm:text-lg flex items-center gap-2">
                <span>Terminal & PWA Diagnostics</span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    isOnline
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400'
                  }`}
                >
                  {isOnline ? <Wifi size={11} /> : <WifiOff size={11} />}
                  <span>{isOnline ? 'Server Reachable' : 'Offline Mode'}</span>
                </span>
              </h2>
              <p className="text-xs text-foreground/60">
                PWA cache health, device identity, storage quota, and offline sales sync queue
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-foreground/40 hover:text-foreground rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Top Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Device Identity */}
            <div className="p-4 bg-surface rounded-xl border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-foreground/60 flex items-center gap-1.5">
                  <Smartphone size={14} className="text-pos-500" />
                  Device Identity
                </span>
                <button
                  onClick={handleCopyDeviceId}
                  className="text-foreground/40 hover:text-foreground transition-colors p-1"
                  title="Copy Device ID"
                >
                  {copiedDevice ? (
                    <Check size={14} className="text-emerald-500" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
              <div className="font-mono text-xs font-semibold text-foreground break-all select-all bg-background/50 p-2 rounded border border-border/50">
                {deviceId || 'Loading...'}
              </div>
              <div className="text-[11px] text-foreground/50 mt-2 flex items-center gap-1">
                <ShieldCheck size={12} className="text-emerald-500" />
                <span>PWA Client v1.3.4</span>
              </div>
            </div>

            {/* Storage Quota */}
            <div className="p-4 bg-surface rounded-xl border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-foreground/60 flex items-center gap-1.5">
                  <HardDrive size={14} className="text-pos-500" />
                  Browser Storage
                </span>
                {storage?.persisted ? (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded border border-emerald-500/20">
                    Persisted
                  </span>
                ) : (
                  <button
                    onClick={handleRequestPersistence}
                    disabled={actionInProgress === 'persist'}
                    className="text-[10px] text-amber-500 hover:underline font-semibold"
                  >
                    Request Persist
                  </button>
                )}
              </div>
              <div>
                <div className="flex items-baseline justify-between text-xs font-semibold mb-1">
                  <span>{storage?.usageMb ?? 0} MB used</span>
                  <span className="text-foreground/50">of {storage?.quotaMb ?? 0} MB</span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      (storage?.percentUsed ?? 0) > 85
                        ? 'bg-red-500'
                        : (storage?.percentUsed ?? 0) > 60
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(storage?.percentUsed ?? 1, 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-[11px] text-foreground/50 mt-2">
                Eviction-proof IndexedDB cache
              </div>
            </div>

            {/* Catalog Health */}
            <div className="p-4 bg-surface rounded-xl border border-border flex flex-col justify-between">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-foreground/60 flex items-center gap-1.5">
                  <Database size={14} className="text-pos-500" />
                  Catalog Cache
                </span>
                <span className="text-[11px] font-mono text-foreground/60">
                  {medicineCount} items
                </span>
              </div>
              <div className="text-xs text-foreground/80 space-y-0.5">
                <div>
                  Batches stored:{' '}
                  <span className="font-semibold text-foreground">{batchCount}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-foreground/50">
                  <Clock size={11} />
                  <span>
                    Last sync:{' '}
                    {lastSyncedAt
                      ? new Date(lastSyncedAt).toLocaleTimeString()
                      : 'Never'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleForceDelta}
                  disabled={actionInProgress !== null}
                  className="flex-1 py-1 px-2 text-[11px] font-semibold bg-background hover:bg-background/80 border border-border rounded transition-colors text-foreground/80"
                >
                  Delta
                </button>
                <button
                  onClick={handleForceBootstrap}
                  disabled={actionInProgress !== null}
                  className="flex-1 py-1 px-2 text-[11px] font-semibold bg-pos-500/10 hover:bg-pos-500/20 text-pos-600 dark:text-pos-400 rounded transition-colors"
                >
                  Full Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Outbox Overview & Actions */}
          <div className="bg-surface rounded-xl border border-border p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>Offline Outbox Sales Queue</span>
                  <span className="text-xs bg-pos-500/10 text-pos-600 dark:text-pos-400 font-semibold px-2 py-0.5 rounded-full border border-pos-500/20">
                    {outboxCounts.pending} pending / {outboxCounts.total} total
                  </span>
                </h3>
                <p className="text-xs text-foreground/60">
                  Sales recorded offline waiting for background batch delivery with idempotency protection
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportOutboxJson}
                  className="flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold bg-background border border-border hover:bg-surface/80 rounded-lg transition-colors text-foreground"
                  title="Export all offline sales as JSON file backup"
                >
                  <FileJson size={14} className="text-pos-500" />
                  <span>Export JSON</span>
                </button>
                <button
                  type="button"
                  onClick={handleTriggerSync}
                  disabled={actionInProgress !== null}
                  className="flex items-center gap-1.5 py-1.5 px-3 text-xs font-semibold bg-pos-600 hover:bg-pos-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  <RefreshCw
                    size={13}
                    className={actionInProgress === 'sync' ? 'animate-spin' : ''}
                  />
                  <span>Sync Outbox Now</span>
                </button>
              </div>
            </div>

            {/* Outbox Table */}
            {outboxItems.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-border rounded-xl">
                <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-1.5 opacity-80" />
                <p className="text-xs font-semibold text-foreground">Outbox is completely clear</p>
                <p className="text-[11px] text-foreground/50">All offline transactions have been synchronized.</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[260px] border border-border rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-background/80 sticky top-0 border-b border-border text-[11px] font-semibold text-foreground/60">
                    <tr>
                      <th className="py-2.5 px-3">Provisional No</th>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Total</th>
                      <th className="py-2.5 px-3">Items</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Attempts</th>
                      <th className="py-2.5 px-3">Server Invoice / Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {outboxItems.map((item) => (
                      <tr key={item.id} className="hover:bg-background/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                          {item.provisionalNo}
                        </td>
                        <td className="py-2.5 px-3 text-foreground/60">
                          {new Date(item.createdAtDevice).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-foreground">
                          {formatMoney(Number(item.payload.totals.total) || 0, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-foreground/60">
                          {item.payload.lines.length} items
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                              item.status === 'synced'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : item.status === 'syncing'
                                ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                                : item.status === 'failed'
                                ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                                : item.status === 'needs_review'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-foreground/60">
                          {item.attempts}
                        </td>
                        <td className="py-2.5 px-3 text-foreground/70 max-w-[200px] truncate">
                          {item.serverInvoiceNo ? (
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                              {item.serverInvoiceNo}
                            </span>
                          ) : (
                            <span className="text-red-500 text-[11px]">
                              {item.lastError || '-'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Danger Zone: Purge Cache */}
          <div className="pt-2 flex items-center justify-between border-t border-border text-xs">
            <span className="text-foreground/50">
              Need a clean catalog slate? Clear cached medicines & batches.
            </span>
            <button
              type="button"
              onClick={handleClearCache}
              disabled={actionInProgress !== null}
              className="py-1.5 px-3 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10 border border-red-500/20 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              <span>Purge Catalog Cache</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
