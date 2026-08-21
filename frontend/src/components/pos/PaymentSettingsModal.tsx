'use client';

import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, ToggleLeft, ToggleRight, TrendingUp, DollarSign, Smartphone, Banknote } from 'lucide-react';
import { usePaymentMethodsStore } from '@/store/payment-methods-store';
import type { PaymentMethod } from '@/store/payment-methods-store';
import { useAppStore } from '@/store/app-store';
import { formatMoney } from '@/lib/utils';

interface PaymentSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const EMOJI_OPTIONS = ['🏦', '📱', '💳', '💰', '🏧', '📲', '🪙', '💸', '🔄', '🛒'];
const COLOR_OPTIONS = ['#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#10B981', '#EC4899', '#06B6D4', '#F97316'];

export default function PaymentSettingsModal({ open, onClose }: PaymentSettingsModalProps) {
  const { currency } = useAppStore();
  const { methods, addMethod, updateMethod, deleteMethod, toggleMethod, completedSales, getSalesTotals, clearSalesHistory, requireCashSession, setRequireCashSession } = usePaymentMethodsStore();

  const [activeTab, setActiveTab] = useState<'methods' | 'summary'>('methods');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState('🏦');
  const [newColor, setNewColor] = useState('#3B82F6');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState('');
  const [editColor, setEditColor] = useState('');

  const mobileMethods = methods.filter((m) => m.type === 'mobile');
  const totals = getSalesTotals();

  const handleAdd = () => {
    if (!newName.trim()) return;
    addMethod({
      name: newName.trim(),
      type: 'mobile',
      logo: newLogo,
      enabled: true,
      color: newColor,
    });
    setNewName('');
    setNewLogo('🏦');
    setNewColor('#3B82F6');
    setIsAdding(false);
  };

  const startEdit = (method: PaymentMethod) => {
    setEditingId(method.id);
    setEditName(method.name);
    setEditLogo(method.logo);
    setEditColor(method.color);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateMethod(editingId, {
      name: editName.trim(),
      logo: editLogo,
      color: editColor,
    });
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (id === 'cash') return; // Can't delete cash
    deleteMethod(id);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-background rounded-[16px] max-w-[640px] w-[95%] max-h-[85vh] shadow-[0_25px_50px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Payment Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-full text-foreground/50 transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('methods')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'methods'
                ? 'text-pos-500 border-b-2 border-pos-500'
                : 'text-foreground/50 hover:text-foreground/70'
            }`}
          >
            Payment Methods
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'summary'
                ? 'text-pos-500 border-b-2 border-pos-500'
                : 'text-foreground/50 hover:text-foreground/70'
            }`}
          >
            Sales Summary
            {completedSales.length > 0 && (
              <span className="ml-1.5 bg-pos-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {completedSales.length}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ===== METHODS TAB ===== */}
          {activeTab === 'methods' && (
            <div>
              {/* Cash - always present, not editable */}
              <div className="text-[11px] font-semibold text-foreground/40 uppercase tracking-wide mb-2">Cash Payment</div>
              <div className="flex items-center justify-between bg-surface rounded-xl p-4 mb-6 border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-xl">
                    💵
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Cash</div>
                    <div className="text-[11px] text-foreground/40">Default payment method</div>
                  </div>
                </div>
                <span className="text-xs text-green-500 font-medium bg-green-100 dark:bg-green-500/20 px-2 py-1 rounded-full">
                  Always On
                </span>
              </div>

              {/* Mobile Bank Methods */}
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-semibold text-foreground/40 uppercase tracking-wide">Mobile Bank Methods</div>
                <button
                  onClick={() => setIsAdding(true)}
                  className="flex items-center gap-1 text-xs font-medium text-pos-500 hover:text-pos-600 transition-colors"
                >
                  <Plus size={14} /> Add New
                </button>
              </div>

              <div className="space-y-2">
                {mobileMethods.map((method) => (
                  <div key={method.id} className="bg-surface rounded-xl p-3 border border-border">
                    {editingId === method.id ? (
                      /* Edit mode */
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-pos-400"
                            placeholder="Method name"
                          />
                          <button onClick={handleSaveEdit} className="bg-pos-500 text-white px-3 py-2 rounded-lg hover:bg-pos-600 transition-colors">
                            <Check size={16} />
                          </button>
                          <button onClick={() => setEditingId(null)} className="bg-surface border border-border text-foreground/50 px-3 py-2 rounded-lg hover:bg-border transition-colors">
                            <X size={16} />
                          </button>
                        </div>
                        {/* Emoji picker */}
                        <div>
                          <div className="text-[10px] text-foreground/40 mb-1">Icon</div>
                          <div className="flex gap-1.5 flex-wrap">
                            {EMOJI_OPTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => setEditLogo(emoji)}
                                className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                                  editLogo === emoji ? 'bg-pos-100 dark:bg-pos-500/20 border-2 border-pos-400 scale-110' : 'bg-background border border-border hover:bg-surface'
                                }`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* Color picker */}
                        <div>
                          <div className="text-[10px] text-foreground/40 mb-1">Color</div>
                          <div className="flex gap-1.5 flex-wrap">
                            {COLOR_OPTIONS.map((color) => (
                              <button
                                key={color}
                                onClick={() => setEditColor(color)}
                                className={`w-7 h-7 rounded-full transition-all ${
                                  editColor === color ? 'ring-2 ring-pos-500 ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'
                                }`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Display mode */
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
                            style={{ backgroundColor: method.color + '20' }}
                          >
                            {method.logo}
                          </div>
                          <div>
                            <div className={`font-semibold ${method.enabled ? 'text-foreground' : 'text-foreground/40 line-through'}`}>{method.name}</div>
                            <div className="text-[11px] text-foreground/40">Mobile Bank</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleMethod(method.id)}
                            className="text-foreground/40 hover:text-foreground/70 transition-colors"
                            title={method.enabled ? 'Disable' : 'Enable'}
                          >
                            {method.enabled ? (
                              <ToggleRight size={24} className="text-pos-500" />
                            ) : (
                              <ToggleLeft size={24} />
                            )}
                          </button>
                          <button
                            onClick={() => startEdit(method)}
                            className="p-1.5 hover:bg-background rounded-lg text-foreground/40 hover:text-foreground/70 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(method.id)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-foreground/40 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {mobileMethods.length === 0 && !isAdding && (
                  <div className="text-center py-6 text-foreground/30">
                    <Smartphone size={24} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No mobile bank methods</p>
                  </div>
                )}
              </div>

              {/* Add New Form */}
              {isAdding && (
                <div className="mt-3 bg-surface rounded-xl p-4 border-2 border-dashed border-pos-300">
                  <div className="text-sm font-semibold text-foreground mb-3">New Mobile Bank</div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-pos-400"
                      placeholder="e.g. MTN Mobile Money"
                      autoFocus
                    />
                    {/* Emoji picker */}
                    <div>
                      <div className="text-[10px] text-foreground/40 mb-1">Icon</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {EMOJI_OPTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => setNewLogo(emoji)}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                              newLogo === emoji ? 'bg-pos-100 dark:bg-pos-500/20 border-2 border-pos-400 scale-110' : 'bg-background border border-border hover:bg-surface'
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Color picker */}
                    <div>
                      <div className="text-[10px] text-foreground/40 mb-1">Color</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {COLOR_OPTIONS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setNewColor(color)}
                            className={`w-7 h-7 rounded-full transition-all ${
                              newColor === color ? 'ring-2 ring-pos-500 ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleAdd}
                        disabled={!newName.trim()}
                        className="flex-1 bg-pos-500 text-white py-2 rounded-lg text-sm font-semibold hover:bg-pos-600 transition-colors disabled:opacity-40"
                      >
                        Add Method
                      </button>
                      <button
                        onClick={() => setIsAdding(false)}
                        className="bg-surface border border-border text-foreground/60 py-2 px-4 rounded-lg text-sm hover:bg-border transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Register Shift Setting */}
              <div className="mt-6 pt-4 border-t border-border">
                <div className="text-[11px] font-semibold text-foreground/40 uppercase tracking-wide mb-2">Shift & Register Controls</div>
                <div className="flex items-center justify-between bg-surface rounded-xl p-4 border border-border">
                  <div>
                    <div className="font-semibold text-foreground text-sm">Require Cash Register Shifts</div>
                    <div className="text-xs text-foreground/50 mt-0.5">Prompt cashier to open with float and close with count</div>
                  </div>
                  <button
                    onClick={() => setRequireCashSession(!requireCashSession)}
                    className="text-foreground/40 hover:text-foreground/70 transition-colors ml-4"
                    title={requireCashSession ? 'Enabled' : 'Disabled'}
                  >
                    {requireCashSession ? (
                      <ToggleRight size={28} className="text-pos-500" />
                    ) : (
                      <ToggleLeft size={28} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===== SALES SUMMARY TAB ===== */}
          {activeTab === 'summary' && (
            <div>
              {/* Overview Cards */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-surface rounded-xl p-4 border border-border text-center">
                  <div className="text-[10px] font-semibold text-foreground/40 uppercase mb-1">Total Sales</div>
                  <div className="text-xl font-black text-foreground">{totals.totalCount}</div>
                  <div className="text-sm font-semibold text-pos-500 mt-1">{formatMoney(totals.grandTotal, currency)}</div>
                </div>
                <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-4 border border-green-200 dark:border-green-500/20 text-center">
                  <div className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase mb-1">Cash</div>
                  <div className="text-xl font-black text-green-700 dark:text-green-300">{totals.byMethod['cash']?.count || 0}</div>
                  <div className="text-sm font-semibold text-green-600 dark:text-green-400 mt-1">{formatMoney(totals.cash, currency)}</div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-4 border border-blue-200 dark:border-blue-500/20 text-center">
                  <div className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase mb-1">Mobile</div>
                  <div className="text-xl font-black text-blue-700 dark:text-blue-300">{Object.values(totals.byMethod).filter((_, i) => i > 0).reduce((sum, m) => sum + m.count, 0) || (totals.totalCount - (totals.byMethod['cash']?.count || 0))}</div>
                  <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 mt-1">{formatMoney(totals.mobile, currency)}</div>
                </div>
              </div>

              {/* Per-method breakdown */}
              <div className="text-[11px] font-semibold text-foreground/40 uppercase tracking-wide mb-3">Breakdown by Method</div>
              <div className="space-y-2 mb-6">
                {Object.entries(totals.byMethod).map(([methodId, data]) => {
                  const method = methods.find((m) => m.id === methodId);
                  const percentage = totals.grandTotal > 0 ? (data.total / totals.grandTotal) * 100 : 0;
                  return (
                    <div key={methodId} className="bg-surface rounded-xl p-3 border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                            style={{ backgroundColor: (method?.color || '#6B7280') + '20' }}
                          >
                            {method?.logo || '💳'}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground">{data.name}</div>
                            <div className="text-[10px] text-foreground/40">{data.count} sales</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-foreground">{formatMoney(data.total, currency)}</div>
                          <div className="text-[10px] text-foreground/40">{percentage.toFixed(1)}%</div>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: method?.color || '#6B7280',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                {Object.keys(totals.byMethod).length === 0 && (
                  <div className="text-center py-8 text-foreground/30">
                    <TrendingUp size={28} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No sales recorded yet</p>
                    <p className="text-[11px] mt-1">Complete a sale to see the breakdown</p>
                  </div>
                )}
              </div>

              {/* Recent sales */}
              {completedSales.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[11px] font-semibold text-foreground/40 uppercase tracking-wide">
                      Recent Sales ({completedSales.length})
                    </div>
                    <button
                      onClick={() => {
                        if (confirm('Clear all sales history?')) clearSalesHistory();
                      }}
                      className="text-[11px] text-red-500 hover:text-red-600 font-medium"
                    >
                      Clear History
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                    {[...completedSales].reverse().slice(0, 20).map((sale) => {
                      const method = methods.find((m) => m.id === sale.paymentMethodId);
                      return (
                        <div key={sale.id} className="flex items-center justify-between bg-surface rounded-lg p-2.5 border border-border">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
                              style={{ backgroundColor: (method?.color || '#6B7280') + '20' }}
                            >
                              {method?.logo || '💳'}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-foreground truncate">
                                {sale.items.length} item{sale.items.length > 1 ? 's' : ''}
                                {sale.customerName && ` • ${sale.customerName}`}
                              </div>
                              <div className="text-[10px] text-foreground/40">
                                {sale.paymentMethodName} • {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-foreground shrink-0 ml-2">
                            {formatMoney(sale.total, currency)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
