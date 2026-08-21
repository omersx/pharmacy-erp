'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app-store';
import { ArrowLeft, Plus, Edit, Ban, Package, Activity, DollarSign, Calendar, Archive } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { SlideOver } from '@/components/ui/slide-over';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { format, differenceInDays } from 'date-fns';

export default function MedicineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const [medicine, setMedicine] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { currency } = useAppStore();

  // SlideOver State
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [deactivateDialog, setDeactivateDialog] = useState({ open: false, batchId: '', batchNumber: '' });

  const defaultBatchForm = {
    batch_number: '',
    quantity: '',
    purchase_price: '',
    production_date: '',
    expiry_date: '',
    supplier_id: '',
    notes: '',
    status: 'ACTIVE'
  };
  const [batchForm, setBatchForm] = useState(defaultBatchForm);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [medRes, catsRes, suppsRes] = await Promise.all([
        api.getMedicine(id),
        api.getCategoryTree().catch(() => []),
        api.getSuppliers().catch(() => [])
      ]);
      setMedicine(medRes);
      setCategories(catsRes as any[]);
      setSuppliers(suppsRes as any[]);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load medicine details');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryName = (catId: string) => {
    for (const c1 of categories) {
      if (c1.id === catId) return c1.name_en;
      if (c1.children) {
        for (const c2 of c1.children) {
          if (c2.id === catId) return c2.name_en;
        }
      }
    }
    return 'Uncategorized';
  };

  const openAddBatch = () => {
    setEditingBatch(null);
    setBatchForm({
      ...defaultBatchForm,
      batch_number: `BATCH-${Date.now().toString().slice(-6)}`
    });
    setSlideOpen(true);
  };

  const openEditBatch = (batch: any) => {
    setEditingBatch(batch);
    setBatchForm({
      batch_number: batch.batch_number || '',
      quantity: batch.quantity?.toString() || '',
      purchase_price: batch.purchase_price?.toString() || '',
      production_date: batch.production_date ? batch.production_date.split('T')[0] : '',
      expiry_date: batch.expiry_date ? batch.expiry_date.split('T')[0] : '',
      supplier_id: batch.supplier_id || '',
      notes: batch.notes || '',
      status: batch.status || 'ACTIVE'
    });
    setSlideOpen(true);
  };

  const handleSaveBatch = async () => {
    try {
      setIsSaving(true);
      if (editingBatch) {
        // Edit mode
        const payload = {
          purchase_price: Number(batchForm.purchase_price),
          production_date: batchForm.production_date || null,
          expiry_date: batchForm.expiry_date,
          status: batchForm.status,
          notes: batchForm.notes,
          supplier_id: batchForm.supplier_id || null,
        };
        await api.updateBatch(id, editingBatch.id, payload);
        toast.success('Batch updated successfully');
      } else {
        // Add mode
        if (!batchForm.quantity || !batchForm.purchase_price || !batchForm.expiry_date) {
          toast.error('Please fill required fields');
          setIsSaving(false);
          return;
        }
        const payload = {
          batch_number: batchForm.batch_number,
          quantity: Number(batchForm.quantity),
          purchase_price: Number(batchForm.purchase_price),
          production_date: batchForm.production_date || null,
          expiry_date: batchForm.expiry_date,
          supplier_id: batchForm.supplier_id || null,
          notes: batchForm.notes
        };
        await api.createBatch(id, payload);
        toast.success('Batch added successfully');
      }
      setSlideOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save batch');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivateBatch = async () => {
    try {
      setIsSaving(true);
      await api.deactivateBatch(id, deactivateDialog.batchId);
      toast.success('Batch deactivated successfully');
      setDeactivateDialog({ open: false, batchId: '', batchNumber: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to deactivate batch');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading medicine details...</div>;
  }

  if (!medicine) {
    return <div className="p-8 text-center text-muted-foreground">Medicine not found.</div>;
  }

  const activeBatches = medicine.batches?.filter((b: any) => b.status === 'ACTIVE' || b.status === 'NEAR_EXPIRY') || [];
  const totalStock = activeBatches.reduce((acc: number, b: any) => acc + (b.quantity || 0), 0);
  
  // Calculate average cost
  let totalValue = 0;
  let totalQty = 0;
  activeBatches.forEach((b: any) => {
    totalValue += (b.purchase_price || 0) * (b.quantity || 0);
    totalQty += (b.quantity || 0);
  });
  const avgCost = totalQty > 0 ? (totalValue / totalQty).toFixed(2) : '0.00';

  const getBatchStatusVariant = (status: string, expiry: string) => {
    if (status !== 'ACTIVE') {
      if (status === 'EXPIRED' || status === 'RECALLED' || status === 'DAMAGED') return 'danger';
      if (status === 'QUARANTINED') return 'warning';
      return 'default';
    }
    
    // Check expiry
    if (expiry) {
      const daysToExpiry = differenceInDays(new Date(expiry), new Date());
      if (daysToExpiry < 0) return 'danger';
      if (daysToExpiry <= 90) return 'warning';
    }
    return 'success';
  };
  
  const getBatchStatusLabel = (status: string, expiry: string) => {
    if (status !== 'ACTIVE') return status;
    if (expiry) {
      const daysToExpiry = differenceInDays(new Date(expiry), new Date());
      if (daysToExpiry < 0) return 'EXPIRED';
      if (daysToExpiry <= 90) return 'NEAR EXPIRY';
    }
    return 'ACTIVE';
  };

  return (
    <div className="flex flex-col gap-6 bg-transparent text-foreground">
      {/* Header */}
      <header className="flex-none rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={() => router.push('/catalog/products')}
            className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{medicine.name_en}</h1>
                <Badge variant={medicine.is_active ? 'success' : 'danger'}>
                  {medicine.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2 text-sm text-muted-foreground">
                {medicine.generic_name && (
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-400">Generic:</span> {medicine.generic_name}
                  </div>
                )}
                {medicine.manufacturer && (
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-400">Manufacturer:</span> {medicine.manufacturer}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-gray-400">Category:</span> {getCategoryName(medicine.category_id)}
                </div>
                {medicine.dosage_form && (
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-gray-400">Form:</span> <span className="capitalize">{medicine.dosage_form.replace('_', ' ')}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-right bg-background border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Selling Price</div>
              <div className="text-xl font-bold text-brand-400">{currency} {Number(medicine.selling_price).toFixed(2)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-surface p-5 flex items-center gap-4">
          <div className="p-3 bg-brand-500/10 text-brand-400 rounded-lg">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Total Active Stock</div>
            <div className="text-2xl font-bold text-foreground mt-0.5">{totalStock} <span className="text-sm font-normal text-muted-foreground">{medicine.base_unit || 'Units'}</span></div>
          </div>
        </div>
        
        <div className="rounded-xl border border-border bg-surface p-5 flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Active Batches</div>
            <div className="text-2xl font-bold text-foreground mt-0.5">{activeBatches.length}</div>
          </div>
        </div>
        
        <div className="rounded-xl border border-border bg-surface p-5 flex items-center gap-4">
          <div className="p-3 bg-green-500/10 text-green-400 rounded-lg">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">Average Cost</div>
            <div className="text-2xl font-bold text-foreground mt-0.5"><span className="text-sm font-normal text-muted-foreground mr-1">{currency}</span>{avgCost}</div>
          </div>
        </div>
      </div>

      {/* Batches Table */}
      <main className="flex-1">
        <div className="rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Archive className="h-5 w-5 text-muted-foreground" />
              Batch Management
            </h2>
            <button 
              onClick={openAddBatch}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-foreground transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Batch
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">Batch Number</th>
                  <th className="px-6 py-4 font-semibold">Quantity</th>
                  <th className="px-6 py-4 font-semibold">Purchase Price</th>
                  <th className="px-6 py-4 font-semibold">Expiry Date</th>
                  <th className="px-6 py-4 font-semibold">Supplier</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {(!medicine.batches || medicine.batches.length === 0) ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      No batches found for this product.
                    </td>
                  </tr>
                ) : (
                  medicine.batches.map((batch: any) => (
                    <tr key={batch.id} className="transition-colors hover:bg-gray-800/40 group">
                      <td className="px-6 py-4 font-mono text-xs">{batch.batch_number}</td>
                      <td className="px-6 py-4 font-medium">{batch.quantity}</td>
                      <td className="px-6 py-4">{currency} {Number(batch.purchase_price).toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {batch.expiry_date ? format(new Date(batch.expiry_date), 'dd MMM yyyy') : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {suppliers.find(s => s.id === batch.supplier_id)?.name || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={getBatchStatusVariant(batch.status, batch.expiry_date)}>
                          {getBatchStatusLabel(batch.status, batch.expiry_date)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openEditBatch(batch)}
                            className="p-1.5 text-muted-foreground hover:text-brand-400 hover:bg-brand-500/10 rounded-md transition-colors"
                            title="Edit Batch"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {batch.status !== 'INACTIVE' && (
                            <button 
                              onClick={() => setDeactivateDialog({ open: true, batchId: batch.id, batchNumber: batch.batch_number })}
                              className="p-1.5 text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors"
                              title="Deactivate Batch"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* SlideOver Form for Add/Edit Batch */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingBatch ? 'Edit Batch' : 'Add New Batch'}
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setSlideOpen(false)}
              className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveBatch}
              disabled={isSaving}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-foreground transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Batch'}
            </button>
          </div>
        }
      >
        <div className="space-y-6 pb-8">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Batch Number {editingBatch ? '' : '*'}</label>
              <input 
                type="text" 
                value={batchForm.batch_number} 
                onChange={e => setBatchForm({...batchForm, batch_number: e.target.value})}
                disabled={!!editingBatch}
                className={cn("w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500", editingBatch && "opacity-60 cursor-not-allowed")}
              />
            </div>
            
            {!editingBatch && (
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Quantity Received *</label>
                <input 
                  type="number" min="1"
                  value={batchForm.quantity} 
                  onChange={e => setBatchForm({...batchForm, quantity: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            )}
            
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Purchase Price ({currency}) *</label>
              <input 
                type="number" step="0.01" min="0"
                value={batchForm.purchase_price} 
                onChange={e => setBatchForm({...batchForm, purchase_price: e.target.value})}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Supplier</label>
              <Select 
                value={batchForm.supplier_id} 
                onChange={v => setBatchForm({...batchForm, supplier_id: v})}
                options={suppliers.map(s => ({value: s.id, label: s.name}))}
                placeholder="Select supplier..."
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Production Date</label>
              <input 
                type="date" 
                value={batchForm.production_date} 
                onChange={e => setBatchForm({...batchForm, production_date: e.target.value})}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Expiry Date *</label>
              <input 
                type="date" 
                value={batchForm.expiry_date} 
                onChange={e => setBatchForm({...batchForm, expiry_date: e.target.value})}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                style={{ colorScheme: 'dark' }}
              />
            </div>

            {editingBatch && (
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Status</label>
                <Select 
                  value={batchForm.status} 
                  onChange={v => setBatchForm({...batchForm, status: v})}
                  options={[
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'QUARANTINED', label: 'Quarantined' },
                    { value: 'RECALLED', label: 'Recalled' },
                    { value: 'DAMAGED', label: 'Damaged' },
                    { value: 'INACTIVE', label: 'Inactive' }
                  ]}
                />
              </div>
            )}
            
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Notes</label>
              <textarea 
                rows={3}
                value={batchForm.notes} 
                onChange={e => setBatchForm({...batchForm, notes: e.target.value})}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              />
            </div>
          </div>
        </div>
      </SlideOver>

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        open={deactivateDialog.open}
        onCancel={() => setDeactivateDialog({ open: false, batchId: '', batchNumber: '' })}
        onConfirm={handleDeactivateBatch}
        title="Deactivate Batch"
        message={`Are you sure you want to deactivate batch ${deactivateDialog.batchNumber}? This will hide it from active stock.`}
        isLoading={isSaving}
        confirmText="Deactivate"
      />
    </div>
  );
}
