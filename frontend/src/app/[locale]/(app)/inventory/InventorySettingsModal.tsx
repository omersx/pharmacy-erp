'use client';

import React, { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { useParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { api } from '@/lib/api';
import { 
  Store, Boxes, Check, Sparkles, AlertCircle, X, ShieldCheck, RefreshCw, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface InventorySettingsModalProps {
  open: boolean;
  onClose: () => void;
  onModeChanged?: () => void;
}

export function InventorySettingsModal({ open, onClose, onModeChanged }: InventorySettingsModalProps) {
  const params = useParams();
  const isAr = params?.locale === 'ar';

  const inventoryMode = useAppStore(state => state.inventoryMode);
  const setInventoryMode = useAppStore(state => state.setInventoryMode);

  const [zeroWarehouseOnSwitch, setZeroWarehouseOnSwitch] = useState<boolean>(true);
  const [isConsolidating, setIsConsolidating] = useState<boolean>(false);

  if (!open) return null;

  const handleSelectMode = async (mode: 'simple' | 'multi_location') => {
    try {
      if (mode === 'multi_location' && inventoryMode === 'simple' && zeroWarehouseOnSwitch) {
        setIsConsolidating(true);
        const res = await api.consolidateStockToShelf();
        toast.success(
          isAr
            ? `تم تفعيل نمط المستودع! تم تثبيت كامل المخزون (${res.total_shelf_stock} وحدة) على الرف وتصفير رصيد المستودع (0) بنجاح.`
            : `Multi-Location Mode activated! All stock (${res.total_shelf_stock} units) placed on Front Shelf, and Warehouse set to 0.`
        );
      } else if (mode === 'simple') {
        toast.success(
          isAr 
            ? 'تم تفعيل النمط البسيط (مخزون الرف الموحد) بنجاح!' 
            : 'Simple Mode activated! Shelf Refill and Back Store queues are now hidden.'
        );
      } else {
        toast.success(
          isAr 
            ? 'تم تفعيل نمط المستودع متعدد المواقع (الرف + المخزن الخلفي) بنجاح!' 
            : 'Multi-Location Mode activated! Shelf Refill workspace and warehouse balances are now enabled.'
        );
      }

      setInventoryMode(mode);
      if (onModeChanged) {
        onModeChanged();
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || (isAr ? 'حدث خطأ أثناء ضبط المخزون' : 'Failed to configure inventory mode'));
    } finally {
      setIsConsolidating(false);
    }
  };

  const handleManualConsolidation = async () => {
    try {
      setIsConsolidating(true);
      const res = await api.consolidateStockToShelf();
      toast.success(
        isAr
          ? `تم دمج المخزون بنجاح! جميع الأدوية (${res.total_shelf_stock} وحدة) على الرف الآن، ورصيد المستودع أصبح 0.`
          : `Stock consolidated! All items (${res.total_shelf_stock} units) are on Shelf, and Warehouse is 0.`
      );
      if (onModeChanged) {
        onModeChanged();
      }
    } catch (err: any) {
      toast.error(err.message || (isAr ? 'فشل دمج المخزون' : 'Failed to consolidate stock'));
    } finally {
      setIsConsolidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-2xl relative overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <Store size={20} />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {isAr ? 'نمط إدارة وتشغيل المخزون' : 'Inventory Operating Mode'}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr 
                ? 'خصص تتبع المخزون ليناسب حجم صيدليتك وسير العمل اليومي' 
                : 'Configure inventory tracking to match your pharmacy size and daily workflow'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Options Cards */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Option 1: Simple Mode */}
          <div 
            onClick={() => handleSelectMode('simple')}
            className={cn(
              "group relative flex flex-col justify-between rounded-xl border-2 p-5 cursor-pointer transition-all",
              inventoryMode === 'simple'
                ? "border-brand-500 bg-brand-500/5 shadow-md shadow-brand-500/10"
                : "border-border hover:border-border-hover bg-background/50 hover:bg-surface-hover/60"
            )}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold">
                  {isAr ? 'موصى به للصيدليات الصغيرة' : 'Recommended for Small Stores'}
                </span>
                <div className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                  inventoryMode === 'simple'
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-muted-foreground/30"
                )}>
                  {inventoryMode === 'simple' && <Check size={12} strokeWidth={3} />}
                </div>
              </div>

              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Store size={18} />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  {isAr ? 'النمط البسيط (رف العرض فقط)' : 'Simple Mode (Single Shelf)'}
                </h3>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {isAr
                  ? 'رقم واحد مباشر للمخزون المعروض. يتم إخفاء تعبئة الرفوف وأرقام المستودع لتسهيل العمل اليومي وسرعة الصرف.'
                  : 'Single direct stock count. Hides Shelf Refill queues and Back Store counts for an effortless, distraction-free workflow.'}
              </p>

              <ul className="mt-4 space-y-2 text-xs text-foreground/80">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span>{isAr ? 'رقم مخزون موحد بدون تعقيد' : 'One unified on-hand quantity'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span>{isAr ? 'إخفاء تبويب تعبئة الرفوف ومستودع التخزين' : 'Refill Tab & Back Store columns hidden'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span>{isAr ? 'استلام المخزون مباشرة للبيع بدون نقل' : 'Direct 1-step intake to sales counter'}</span>
                </li>
              </ul>
            </div>

            <div className="mt-5 pt-3 border-t border-border/50 text-[11px] font-medium text-muted-foreground">
              {isAr ? 'مثالي للصيدليات الفردية والعيادات' : 'Best for retail shops & single-room dispensaries'}
            </div>
          </div>

          {/* Option 2: Multi-Location Mode */}
          <div 
            onClick={() => handleSelectMode('multi_location')}
            className={cn(
              "group relative flex flex-col justify-between rounded-xl border-2 p-5 cursor-pointer transition-all",
              inventoryMode === 'multi_location'
                ? "border-brand-500 bg-brand-500/5 shadow-md shadow-brand-500/10"
                : "border-border hover:border-border-hover bg-background/50 hover:bg-surface-hover/60"
            )}
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2.5 py-0.5 text-[11px] font-bold">
                  {isAr ? 'للصيدليات الكبيرة والمستشفيات' : 'For Hospital & Large Branches'}
                </span>
                <div className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                  inventoryMode === 'multi_location'
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-muted-foreground/30"
                )}>
                  {inventoryMode === 'multi_location' && <Check size={12} strokeWidth={3} />}
                </div>
              </div>

              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Boxes size={18} />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  {isAr ? 'نمط متعدد المواقع (الرف + المستودع)' : 'Multi-Location (Shelf + Back Store)'}
                </h3>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {isAr
                  ? 'فصل دقيق بين كمية الرف الأمامي والمستودع الخلفي، مع مساحة عمل مخصصة لتعبئة الرفوف وقوائم سحب لأمين المستودع.'
                  : 'Strict separation between Front Shelf and Warehouse reserves. Unlocks Shelf Refill queues, batch transfers, and storekeeper pick-lists.'}
              </p>

              <ul className="mt-4 space-y-2 text-xs text-foreground/80">
                <li className="flex items-center gap-2">
                  <span className="text-blue-500">✓</span>
                  <span>{isAr ? 'مقارنة رصيد الرف 🟢 والمستودع 📦' : 'Shelf 🟢 vs. Back Store 📦 tracking'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-500">✓</span>
                  <span>{isAr ? 'تبويب تعبئة الرفوف ومؤشرات النقص' : 'Shelf Refill Workspace & live alerts'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-blue-500">✓</span>
                  <span>{isAr ? 'طباعة قوائم السحب لأمين المخزن' : 'Printable restock pick-lists for storekeeper'}</span>
                </li>
              </ul>
            </div>

            <div className="mt-5 pt-3 border-t border-border/50 text-[11px] font-medium text-muted-foreground">
              {isAr ? 'مثالي للصيدليات الكبيرة وسلاسل الفروع' : 'Best for large pharmacies with back storage rooms'}
            </div>
          </div>

        </div>

        {/* Transition / Zero Warehouse Option */}
        <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={zeroWarehouseOnSwitch}
              onChange={e => setZeroWarehouseOnSwitch(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
            <div>
              <span className="text-xs font-bold text-foreground block">
                {isAr
                  ? 'تهيئة رصيد المستودع ليكون 0 (إبقاء كامل الكميات الحالية على رف الصرف)'
                  : 'Initialize Warehouse stock to 0 (Keep all current medicines on Front Shelf)'}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5 block leading-relaxed">
                {isAr
                  ? 'يوصى به عند التحويل من النمط البسيط: يضمن أن جميع الأدوية تظل متاحة على الرف للبيع الفوري، وتبدأ إدارة المستودع برصيد نظيف يمكنك نقله أو إضافته لاحقاً.'
                  : 'Recommended when switching from Simple Mode: ensures all current items stay on shelves for immediate sales, while warehouse starts clean at 0 ready for transfers.'}
              </span>
            </div>
          </label>

          {inventoryMode === 'multi_location' && (
            <div className="pt-2 border-t border-blue-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                {isAr ? 'تريد إعادة تصفير المستودع وتثبيت الرصيد على الرف؟' : 'Need to reset warehouse and put all balances on shelves?'}
              </span>
              <button
                type="button"
                disabled={isConsolidating}
                onClick={handleManualConsolidation}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-all disabled:opacity-50"
              >
                <RefreshCw size={12} className={cn(isConsolidating && "animate-spin")} />
                {isAr ? 'تصفير المستودع الآن (0)' : 'Reset Warehouse to 0 Now'}
              </button>
            </div>
          )}
        </div>

        {/* Non-Destructive Info Banner */}
        <div className="mt-5 rounded-xl bg-background p-3.5 border border-border flex items-center gap-3 text-xs text-muted-foreground">
          <ShieldCheck size={18} className="text-emerald-500 flex-shrink-0" />
          <span>
            {isAr
              ? 'التبديل بين النمطين آمن 100% ولا يؤثر على بيانات المخزون أو الفواتير؛ يمكنك التغيير في أي وقت.'
              : 'Switching modes is 100% non-destructive and preserves all inventory records; you can switch anytime.'}
          </span>
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end gap-3 pt-3 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
