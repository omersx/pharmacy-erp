'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/app-store';
import { ArrowLeft, Plus, Edit, Ban, Package, Activity, DollarSign, Calendar, Archive, Barcode, Trash2, CheckCircle2, AlertCircle, Copy, Check } from 'lucide-react';
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

  // SlideOver State for Batches
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [deactivateDialog, setDeactivateDialog] = useState({ open: false, batchId: '', batchNumber: '' });

  const defaultBatchForm = {
    batch_number: '',
    barcode: '',
    quantity: '',
    purchase_price: '',
    production_date: '',
    expiry_date: '',
    supplier_id: '',
    notes: '',
    status: 'ACTIVE'
  };
  const [batchForm, setBatchForm] = useState(defaultBatchForm);

  // Barcode Management State
  const [barcodeSlideOpen, setBarcodeSlideOpen] = useState(false);
  const [deleteBarcodeDialog, setDeleteBarcodeDialog] = useState({ open: false, id: '', barcode: '' });
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);
  const defaultBarcodeForm = {
    barcode: '',
    barcode_type: 'PACKAGING', // 'PACKAGING' | 'ALTERNATE'
    packaging_type: 'Box',
    units_per_pack: '10',
    batch_id: '',
    notes: '',
  };
  const [barcodeForm, setBarcodeForm] = useState(defaultBarcodeForm);
  const [barcodeCheck, setBarcodeCheck] = useState<{
    checking: boolean;
    checked: boolean;
    is_unique: boolean;
    conflict_type: string | null;
    conflict_message: string | null;
  }>({
    checking: false,
    checked: false,
    is_unique: true,
    conflict_type: null,
    conflict_message: null,
  });

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
      batch_number: `BATCH-${Date.now().toString().slice(-6)}`,
      barcode: '',
    });
    setSlideOpen(true);
  };

  const openEditBatch = (batch: any) => {
    setEditingBatch(batch);
    setBatchForm({
      batch_number: batch.batch_number || '',
      barcode: batch.barcode || '',
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
        const payload: any = {
          purchase_price: Number(batchForm.purchase_price),
          production_date: batchForm.production_date || null,
          expiry_date: batchForm.expiry_date,
          status: batchForm.status,
          notes: batchForm.notes,
          supplier_id: batchForm.supplier_id || null,
          barcode: batchForm.barcode ? batchForm.barcode.trim() : null,
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
        const payload: any = {
          batch_number: batchForm.batch_number,
          quantity: Number(batchForm.quantity),
          purchase_price: Number(batchForm.purchase_price),
          production_date: batchForm.production_date || null,
          expiry_date: batchForm.expiry_date,
          supplier_id: batchForm.supplier_id || null,
          notes: batchForm.notes,
          barcode: batchForm.barcode ? batchForm.barcode.trim() : null,
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

  // Barcode Uniqueness Debounce Checker
  useEffect(() => {
    const code = barcodeForm.barcode.trim();
    if (!code) {
      setBarcodeCheck({ checking: false, checked: false, is_unique: true, conflict_type: null, conflict_message: null });
      return;
    }

    setBarcodeCheck((prev) => ({ ...prev, checking: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await api.checkBarcode(code);
        let msg: string | null = null;
        if (!res.is_unique && res.conflict_details) {
          if (res.conflict_type === 'PRIMARY') {
            msg = `Barcode in use by product: ${res.conflict_details.medicine_name}`;
          } else if (res.conflict_type === 'BATCH') {
            msg = `Barcode in use by batch ${res.conflict_details.batch_number} (${res.conflict_details.medicine_name})`;
          } else {
            msg = `Barcode in use as packaging barcode for ${res.conflict_details.medicine_name}`;
          }
        }
        setBarcodeCheck({
          checking: false,
          checked: true,
          is_unique: res.is_unique,
          conflict_type: res.conflict_type,
          conflict_message: msg,
        });
      } catch (e) {
        setBarcodeCheck({ checking: false, checked: false, is_unique: true, conflict_type: null, conflict_message: null });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [barcodeForm.barcode]);

  const openAddBarcode = () => {
    setBarcodeForm(defaultBarcodeForm);
    setBarcodeCheck({ checking: false, checked: false, is_unique: true, conflict_type: null, conflict_message: null });
    setBarcodeSlideOpen(true);
  };

  const handleSaveBarcode = async () => {
    const code = barcodeForm.barcode.trim();
    if (!code) {
      toast.error('Please enter a barcode');
      return;
    }
    if (barcodeCheck.checked && !barcodeCheck.is_unique) {
      toast.error(barcodeCheck.conflict_message || 'Barcode is already in use elsewhere');
      return;
    }

    try {
      setIsSaving(true);
      await api.addMedicineBarcode(id, {
        barcode: code,
        barcode_type: barcodeForm.barcode_type,
        packaging_type: barcodeForm.barcode_type === 'PACKAGING' ? barcodeForm.packaging_type : null,
        units_per_pack: barcodeForm.barcode_type === 'PACKAGING' ? (Number(barcodeForm.units_per_pack) || 1) : 1,
        batch_id: barcodeForm.batch_id || null,
        notes: barcodeForm.notes || null,
      });
      toast.success('Barcode registered successfully');
      setBarcodeSlideOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add barcode');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBarcode = async () => {
    try {
      setIsSaving(true);
      await api.deleteMedicineBarcode(id, deleteBarcodeDialog.id);
      toast.success('Barcode removed');
      setDeleteBarcodeDialog({ open: false, id: '', barcode: '' });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete barcode');
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBarcode(text);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedBarcode(null), 2000);
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
                  <th className="px-6 py-4 font-semibold">Barcode</th>
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
                    <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                      No batches found for this product.
                    </td>
                  </tr>
                ) : (
                  medicine.batches.map((batch: any) => (
                    <tr key={batch.id} className="transition-colors hover:bg-gray-800/40 group">
                      <td className="px-6 py-4 font-mono text-xs">{batch.batch_number}</td>
                      <td className="px-6 py-4 font-mono text-xs">
                        {batch.barcode ? (
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <Barcode className="h-3.5 w-3.5 text-brand-400" />
                            {batch.barcode}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
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

        {/* Barcodes & Packaging Table */}
        <div className="rounded-xl border border-border bg-surface shadow-sm mt-6">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Barcode className="h-5 w-5 text-brand-400" />
                Barcode & Packaging Registry
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Register packaging barcodes (Box/Strip multipliers) and alternate barcodes with strict duplicate prevention.
              </p>
            </div>
            <button 
              onClick={openAddBarcode}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-foreground transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Add Barcode
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">Barcode</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Packaging / Multiplier</th>
                  <th className="px-6 py-4 font-semibold">Batch Link</th>
                  <th className="px-6 py-4 font-semibold">Notes</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {/* Primary Barcode Row */}
                <tr className="bg-brand-500/5 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs font-semibold text-brand-400">
                    <div className="flex items-center gap-2">
                      <span>{medicine.barcode || <span className="text-muted-foreground italic font-normal">None configured</span>}</span>
                      {medicine.barcode && (
                        <button
                          onClick={() => copyToClipboard(medicine.barcode)}
                          className="p-1 hover:text-foreground text-muted-foreground transition-colors"
                          title="Copy barcode"
                        >
                          {copiedBarcode === medicine.barcode ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="success">PRIMARY</Badge>
                  </td>
                  <td className="px-6 py-4 font-medium text-muted-foreground">
                    Base Unit (1x)
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    All Batches (FEFO)
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    Standard item barcode
                  </td>
                  <td className="px-6 py-4 text-right text-xs text-muted-foreground">
                    Core Product
                  </td>
                </tr>

                {/* Alternate & Packaging Barcodes */}
                {(!medicine.barcodes || medicine.barcodes.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      No alternate or packaging barcodes registered yet. Click &quot;Add Barcode&quot; to configure box, strip, or imported barcodes.
                    </td>
                  </tr>
                ) : (
                  medicine.barcodes.map((bc: any) => (
                    <tr key={bc.id} className="transition-colors hover:bg-gray-800/40 group">
                      <td className="px-6 py-4 font-mono text-xs text-foreground font-semibold">
                        <div className="flex items-center gap-2">
                          <span>{bc.barcode}</span>
                          <button
                            onClick={() => copyToClipboard(bc.barcode)}
                            className="p-1 hover:text-foreground text-muted-foreground transition-colors"
                            title="Copy barcode"
                          >
                            {copiedBarcode === bc.barcode ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={bc.barcode_type === 'PACKAGING' ? 'warning' : 'default'}>
                          {bc.barcode_type}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {bc.packaging_type ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-semibold text-brand-400">{bc.packaging_type}</span>
                            <span className="text-xs bg-surface border border-border px-1.5 py-0.5 rounded text-muted-foreground">
                              {bc.units_per_pack}x units
                            </span>
                          </span>
                        ) : (
                          `${bc.units_per_pack || 1}x units`
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-muted-foreground">
                        {bc.batch_id ? (
                          medicine.batches?.find((b: any) => b.id === bc.batch_id)?.batch_number || bc.batch_id
                        ) : (
                          'All Batches (FEFO)'
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">
                        {bc.notes || '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => setDeleteBarcodeDialog({ open: true, id: bc.id, barcode: bc.barcode })}
                          className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete Barcode"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Batch Specific Barcode (Optional)</label>
              <input 
                type="text" 
                value={batchForm.barcode} 
                onChange={e => setBatchForm({...batchForm, barcode: e.target.value})}
                placeholder="e.g. BATCH-STICKER-9821"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <p className="text-xs text-muted-foreground">Direct barcode printed specifically on this batch sticker</p>
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

      {/* SlideOver Form for Add Barcode */}
      <SlideOver
        open={barcodeSlideOpen}
        onClose={() => setBarcodeSlideOpen(false)}
        title="Add Alternate or Packaging Barcode"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setBarcodeSlideOpen(false)}
              className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveBarcode}
              disabled={isSaving || (barcodeCheck.checked && !barcodeCheck.is_unique)}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-foreground transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {isSaving ? 'Registering...' : 'Save Barcode'}
            </button>
          </div>
        }
      >
        <div className="space-y-6 pb-8">
          <div className="grid grid-cols-1 gap-4">
            {/* Barcode input with live check */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Barcode *</label>
              <input 
                type="text" 
                value={barcodeForm.barcode} 
                onChange={e => setBarcodeForm({...barcodeForm, barcode: e.target.value})}
                placeholder="Scan or type barcode (e.g. 628100123456)"
                className={cn(
                  "w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1",
                  barcodeCheck.checked && !barcodeCheck.is_unique 
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500" 
                    : barcodeCheck.checked && barcodeCheck.is_unique
                    ? "border-green-500 focus:border-green-500 focus:ring-green-500"
                    : "border-border focus:border-brand-500 focus:ring-brand-500"
                )}
              />
              {barcodeCheck.checking && (
                <p className="text-xs text-brand-400">Checking barcode uniqueness across system...</p>
              )}
              {barcodeCheck.checked && barcodeCheck.is_unique && (
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Barcode is unique and available
                </p>
              )}
              {barcodeCheck.checked && !barcodeCheck.is_unique && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> {barcodeCheck.conflict_message || 'Barcode is already registered!'}
                </p>
              )}
            </div>

            {/* Barcode Type */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Barcode Type *</label>
              <Select 
                value={barcodeForm.barcode_type} 
                onChange={v => setBarcodeForm({...barcodeForm, barcode_type: v})}
                options={[
                  { value: 'PACKAGING', label: 'Packaging Barcode (Box, Strip, Multi-pack)' },
                  { value: 'ALTERNATE', label: 'Alternate Product Barcode (Imported/Alternative EAN)' },
                ]}
              />
            </div>

            {/* Packaging Format (if PACKAGING) */}
            {barcodeForm.barcode_type === 'PACKAGING' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">Packaging Type *</label>
                  <Select 
                    value={barcodeForm.packaging_type} 
                    onChange={v => setBarcodeForm({...barcodeForm, packaging_type: v})}
                    options={[
                      { value: 'Box', label: 'Box (علبة / كرتونة)' },
                      { value: 'Strip', label: 'Strip (شريط)' },
                      { value: 'Blister', label: 'Blister' },
                      { value: 'Carton', label: 'Carton / Outer' },
                      { value: 'Bottle', label: 'Bottle (زجاجة)' },
                      { value: 'Pack', label: 'Pack' },
                      { value: 'Vial', label: 'Vial (أمبول)' },
                    ]}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">Units Per Pack (Multiplier) *</label>
                  <input 
                    type="number" min="1"
                    value={barcodeForm.units_per_pack} 
                    onChange={e => setBarcodeForm({...barcodeForm, units_per_pack: e.target.value})}
                    placeholder="e.g. 10 (for strip of 10 tablets)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <p className="text-xs text-muted-foreground">
                    Scanning this barcode in POS will automatically add {barcodeForm.units_per_pack || 1} units of this medicine.
                  </p>
                </div>
              </>
            )}

            {/* Specific Batch association (optional) */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Link To Specific Batch (Optional)</label>
              <Select 
                value={barcodeForm.batch_id} 
                onChange={v => setBarcodeForm({...barcodeForm, batch_id: v})}
                options={[
                  { value: '', label: 'All Batches (Auto-select by FEFO)' },
                  ...(medicine.batches || []).map((b: any) => ({
                    value: b.id,
                    label: `Batch ${b.batch_number} (Exp: ${b.expiry_date ? b.expiry_date.split('T')[0] : 'N/A'}) - Qty: ${b.quantity}`
                  }))
                ]}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for FEFO automatic batch selection upon scanning.
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Notes</label>
              <textarea 
                rows={2}
                value={barcodeForm.notes} 
                onChange={e => setBarcodeForm({...barcodeForm, notes: e.target.value})}
                placeholder="e.g. 3-strip outer box from local distributor"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              />
            </div>
          </div>
        </div>
      </SlideOver>

      {/* Delete Barcode Confirmation */}
      <ConfirmDialog
        open={deleteBarcodeDialog.open}
        onCancel={() => setDeleteBarcodeDialog({ open: false, id: '', barcode: '' })}
        onConfirm={handleDeleteBarcode}
        title="Remove Barcode"
        message={`Are you sure you want to remove barcode ${deleteBarcodeDialog.barcode}? This barcode will no longer resolve in POS.`}
        isLoading={isSaving}
        confirmText="Remove"
      />

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
