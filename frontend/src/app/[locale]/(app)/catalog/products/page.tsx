'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { DOSAGE_FORMS, BASE_UNITS } from '@/lib/constants';
import { SlideOver } from '@/components/ui/slide-over';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'react-hot-toast';
import { Search, Plus, Edit, Trash2, Package, Pill, Beaker, Tag, DollarSign, Archive, AlertCircle, ChevronDown, Upload } from 'lucide-react';
import { BulkImportModal } from '@/components/ui/bulk-import-modal';
import { cn } from '@/lib/utils';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/store/app-store';

export default function ProductsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;
  const [medicines, setMedicines] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { currency } = useAppStore();
  
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [slideOpen, setSlideOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: '', name: '' });
  const [isSaving, setIsSaving] = useState(false);
  
  // Form State
  const defaultForm = {
    name: '',
    name_ar: '',
    sku: '',
    barcode: '',
    item_type: '',
    therapeutic_category: '',
    dosage_form: '',
    generic_name: '',
    brand_name: '',
    strength: '',
    manufacturer: '',
    description: '',
    selling_price: '',
    base_unit: '',
    units_per_pack: 1,
    reorder_level: 10,
    max_stock: 0,
    requires_prescription: false,
    controlled_substance: false,
    cold_chain: false,
    allow_loose_sale: false,
    // Batch
    has_initial_batch: false,
    batch_quantity: '',
    purchase_price: '',
    production_date: '',
    expiry_date: '',
    batch_number: '',
    supplier_id: ''
  };
  const [formData, setFormData] = useState(defaultForm);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [medsRes, catsRes, suppsRes] = await Promise.all([
        api.getMedicines().catch(() => []),
        api.getCategoryTree().catch(() => []),
        api.getSuppliers().catch(() => [])
      ]);
      setMedicines(medsRes as any[]);
      setCategories(catsRes as any[]);
      setSuppliers(suppsRes as any[]);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const paramId = searchParams.get('id');
  useEffect(() => {
    if (paramId && medicines.length > 0 && !slideOpen) {
      const med = medicines.find(m => m.id === paramId);
      if (med) {
        openEdit(med);
      }
    }
  }, [paramId, medicines]);

  const openAdd = () => {
    setEditingId(null);
    setFormData({
      ...defaultForm,
      sku: `MED-${Date.now()}`,
      batch_number: `BATCH-${Date.now().toString().slice(-6)}`
    });
    setSlideOpen(true);
  };

  const openEdit = (med: any) => {
    setEditingId(med.id);
    setFormData({
      ...defaultForm,
      name: med.name_en || '',
      name_ar: med.name_ar || '',
      sku: med.sku || '',
      barcode: med.barcode || '',
      item_type: med.category?.parent_id || med.category_id || '',
      therapeutic_category: med.category?.parent_id ? med.category_id : '',
      dosage_form: med.dosage_form || '',
      generic_name: med.generic_name || '',
      brand_name: med.brand_name || '',
      strength: med.strength || '',
      manufacturer: med.manufacturer || '',
      description: med.description || '',
      selling_price: med.selling_price?.toString() || '',
      base_unit: med.base_unit || '',
      units_per_pack: med.units_per_pack || 1,
      reorder_level: med.reorder_level || 10,
      max_stock: med.max_stock || 0,
      requires_prescription: med.requires_prescription || false,
      controlled_substance: med.controlled_substance || false,
      cold_chain: med.cold_chain || false,
      allow_loose_sale: med.allow_loose_sale || false,
    });
    setSlideOpen(true);
  };

  const handleDelete = async () => {
    try {
      setIsSaving(true);
      await api.deleteMedicine(deleteDialog.id);
      toast.success('Product deleted');
      setMedicines(prev => prev.filter(m => m.id !== deleteDialog.id));
      setDeleteDialog({ open: false, id: '', name: '' });
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete product');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.sku || !formData.selling_price || !formData.item_type) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      setIsSaving(true);
      
      const category_id = formData.therapeutic_category || formData.item_type;
      
      const payload: any = {
        name: formData.name,
        name_ar: formData.name_ar,
        sku: formData.sku,
        barcode: formData.barcode,
        category_id,
        dosage_form: formData.dosage_form,
        generic_name: formData.generic_name,
        brand_name: formData.brand_name,
        strength: formData.strength,
        manufacturer: formData.manufacturer,
        description: formData.description,
        selling_price: Number(formData.selling_price),
        base_unit: formData.base_unit,
        units_per_pack: Number(formData.units_per_pack),
        reorder_level: Number(formData.reorder_level),
        max_stock: Number(formData.max_stock),
        requires_prescription: formData.requires_prescription,
        controlled_substance: formData.controlled_substance,
        cold_chain: formData.cold_chain,
        allow_loose_sale: formData.allow_loose_sale,
        is_active: true
      };

      if (editingId) {
        await api.updateMedicine(editingId, payload);
        toast.success('Product updated');
      } else {
        if (formData.has_initial_batch) {
          if (!formData.batch_quantity || !formData.purchase_price || !formData.expiry_date) {
            toast.error('Please fill required batch fields');
            setIsSaving(false);
            return;
          }
          await api.createMedicineWithBatch({
            medicine: payload,
            batch: {
              batch_number: formData.batch_number,
              quantity: Number(formData.batch_quantity),
              purchase_price: Number(formData.purchase_price),
              production_date: formData.production_date || null,
              expiry_date: formData.expiry_date,
              supplier_id: formData.supplier_id || null
            }
          });
        } else {
          await api.createMedicine(payload);
        }
        toast.success('Product created');
      }
      setSlideOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

    const getCategoryName = (id: string) => {
    for (const c1 of categories) {
      if (c1.id === id) return c1.name_en;
      if (c1.children) {
        for (const c2 of c1.children) {
          if (c2.id === id) return c2.name_en;
        }
      }
    }
    return 'Uncategorized';
  };

  const filteredMedicines = useMemo(() => {
    return medicines.filter(med => {
      const matchSearch = search.toLowerCase() === '' || 
        med.name_en?.toLowerCase().includes(search.toLowerCase()) || 
        med.sku?.toLowerCase().includes(search.toLowerCase()) || 
        med.barcode?.toLowerCase().includes(search.toLowerCase());
      
      const matchCategory = categoryFilter === 'all' || 
        med.category_id === categoryFilter || 
        med.category?.parent_id === categoryFilter;
      
      const matchStatus = statusFilter === 'all' || 
        (statusFilter === 'active' && med.is_active) || 
        (statusFilter === 'inactive' && !med.is_active);

      return matchSearch && matchCategory && matchStatus;
    });
  }, [medicines, search, categoryFilter, statusFilter]);

  const level1Cats = categories || [];
  const selectedLevel1 = level1Cats.find(c => c.id === formData.item_type);
  const level2Cats = selectedLevel1?.children || [];
  const showTherapeutic = selectedLevel1?.name_en?.toLowerCase().includes('prescription') || level2Cats.length > 0;

  return (
    <div className="flex flex-col gap-6 bg-transparent text-foreground">
      {/* Header */}
      <header className="flex-none rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Medicine Catalog</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-muted-foreground">Manage medicines, pricing, and initial stock</p>
              <div className="flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-500/20">
                {medicines.length} Total Items
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setImportModalOpen(true)}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-[#0B1220] gap-2"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
            <button 
              onClick={openAdd}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-foreground transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-[#0B1220] gap-2 shadow-lg shadow-brand-500/20"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input 
              type="text"
              placeholder="Search by name, SKU, or barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <Select 
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[{value: 'all', label: 'All Categories'}, ...level1Cats.map(c => ({value: c.id, label: c.name_en}))]}
              className="w-[200px]"
            />
            <div className="flex items-center rounded-lg border border-border bg-background p-1">
              <button 
                onClick={() => setStatusFilter('all')}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", statusFilter === 'all' ? "bg-gray-700 text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                All
              </button>
              <button 
                onClick={() => setStatusFilter('active')}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", statusFilter === 'active' ? "bg-brand-500/20 text-brand-400" : "text-muted-foreground hover:text-foreground")}
              >
                Active
              </button>
              <button 
                onClick={() => setStatusFilter('inactive')}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors", statusFilter === 'inactive' ? "bg-gray-700 text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                Inactive
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Table */}
      <main className="flex-1">
        <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">Product Name</th>
                  <th className="px-6 py-4 font-semibold">SKU / Barcode</th>
                  <th className="px-6 py-4 font-semibold">Category</th>
                  <th className="px-6 py-4 font-semibold">Price ({currency})</th>
                  <th className="px-6 py-4 font-semibold">Stock</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-4"><div className="h-4 bg-gray-800 rounded w-3/4"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-800 rounded w-1/2"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-800 rounded w-2/3"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-800 rounded w-1/3"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-800 rounded w-1/4"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-800 rounded w-1/3"></div></td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-800 rounded w-8 ml-auto"></div></td>
                    </tr>
                  ))
                ) : filteredMedicines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <Package className="h-12 w-12 text-gray-600 mb-4" />
                        <h3 className="text-lg font-medium text-foreground">No products found</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-sm">Get started by adding a new product to your catalog or adjust your filters.</p>
                        <button onClick={openAdd} className="mt-6 text-brand-400 hover:text-brand-300 font-medium text-sm flex items-center gap-1">
                          <Plus className="h-4 w-4" /> Add your first product
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredMedicines.map((med) => {
                    const totalStock = med.batches?.reduce((acc: number, b: any) => acc + (b.quantity || 0), 0) || 0;
                    return (
                      <tr 
                        key={med.id} 
                        onClick={() => router.push(`/${locale}/catalog/products/${med.id}`)}
                        className="transition-colors hover:bg-gray-800/40 group cursor-pointer"
                      >
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{med.name_en}</span>
                            {med.strength && <span className="text-xs text-brand-400 mt-0.5">{med.strength}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs text-foreground">{med.sku}</span>
                            {med.barcode && <span className="text-xs text-muted-foreground">{med.barcode}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm">{getCategoryName(med.category_id)}</span>
                            {med.dosage_form && <span className="text-xs text-muted-foreground capitalize">{med.dosage_form.replace('_', ' ')}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-foreground">{Number(med.selling_price).toFixed(2)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={cn("font-medium", totalStock <= med.reorder_level ? "text-amber-400" : totalStock === 0 ? "text-red-400" : "text-green-400")}>
                              {totalStock}
                            </span>
                            <span className="text-xs text-muted-foreground">{med.base_unit || 'Unit'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={med.is_active ? 'success' : 'danger'}>
                            {med.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(med);
                              }}
                              className="p-1.5 text-muted-foreground hover:text-brand-400 hover:bg-brand-500/10 rounded-md transition-colors"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteDialog({ open: true, id: med.id, name: med.name_en });
                              }}
                              className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
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
      </main>

      {/* SlideOver Form */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title={editingId ? 'Edit Product' : 'Add New Product'}
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setSlideOpen(false)}
              className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-foreground transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        }
      >
        <div className="space-y-8 pb-8">
          {/* Basic Info */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Pill className="h-4 w-4" /> Basic Information
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">Name *</label>
                  <input 
                    type="text" 
                    value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">Generic Name</label>
                  <input 
                    type="text" 
                    value={formData.generic_name} onChange={e => setFormData({...formData, generic_name: e.target.value})}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">Manufacturer</label>
                  <input 
                    type="text" 
                    value={formData.manufacturer} onChange={e => setFormData({...formData, manufacturer: e.target.value})}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">SKU *</label>
                  <input 
                    type="text" 
                    value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">Barcode</label>
                  <input 
                    type="text" 
                    value={formData.barcode} onChange={e => setFormData({...formData, barcode: e.target.value})}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Classification */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Tag className="h-4 w-4" /> Classification
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">Item Type *</label>
                  <Select 
                    value={formData.item_type} 
                    onChange={v => setFormData({...formData, item_type: v, therapeutic_category: ''})}
                    options={level1Cats.map(c => ({value: c.id, label: c.name_en}))}
                    placeholder="Select item type..."
                  />
                </div>
                {showTherapeutic && (
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                    <label className="text-sm text-muted-foreground">Therapeutic Category</label>
                    <Select 
                      value={formData.therapeutic_category} 
                      onChange={v => setFormData({...formData, therapeutic_category: v})}
                      options={level2Cats.map((c: any) => ({value: c.id, label: c.name_en}))}
                      placeholder="Select therapeutic category..."
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm text-muted-foreground">Dosage Form</label>
                  <Select 
                    value={formData.dosage_form} 
                    onChange={v => setFormData({...formData, dosage_form: v})}
                    options={DOSAGE_FORMS.map(d => ({value: d.value, label: d.label_en}))}
                    placeholder="Select dosage form..."
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Details */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Beaker className="h-4 w-4" /> Product Details
            </div>
            <div className="space-y-4">


              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Description</label>
                <textarea 
                  rows={3}
                  value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                />
              </div>
            </div>
          </section>

          {/* Pricing & Units */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-4 w-4" /> Pricing & Units
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Selling Price ({currency}) *</label>
                <input 
                  type="number" step="0.01" min="0"
                  value={formData.selling_price} onChange={e => setFormData({...formData, selling_price: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Base Unit</label>
                <Select 
                  value={formData.base_unit} 
                  onChange={v => setFormData({...formData, base_unit: v})}
                  options={BASE_UNITS.map(u => ({value: u.value, label: u.label_en}))}
                  placeholder="Select unit..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Units per Pack</label>
                <input 
                  type="number" min="1"
                  value={formData.units_per_pack} onChange={e => setFormData({...formData, units_per_pack: parseInt(e.target.value) || 1})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
          </section>

          {/* Initial Stock (Only on creation) */}
          {!editingId && (
            <section className="space-y-4 rounded-xl border border-brand-500/20 bg-brand-500/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-400">
                  <Archive className="h-4 w-4" /> Initial Stock Batch
                </div>
                <Switch 
                  checked={formData.has_initial_batch} 
                  onCheckedChange={c => setFormData({...formData, has_initial_batch: c})} 
                />
              </div>
              
              {formData.has_initial_batch && (
                <div className="grid grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-top-2">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Quantity *</label>
                    <input 
                      type="number" min="1"
                      value={formData.batch_quantity} onChange={e => setFormData({...formData, batch_quantity: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Purchase Price ({currency}) *</label>
                    <input 
                      type="number" step="0.01" min="0"
                      value={formData.purchase_price} onChange={e => setFormData({...formData, purchase_price: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Batch Number</label>
                    <input 
                      type="text" 
                      value={formData.batch_number} onChange={e => setFormData({...formData, batch_number: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Supplier</label>
                    <Select 
                      value={formData.supplier_id} 
                      onChange={v => setFormData({...formData, supplier_id: v})}
                      options={suppliers.map(s => ({value: s.id, label: s.name}))}
                      placeholder="Select supplier..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Production Date</label>
                    <input 
                      type="date" 
                      value={formData.production_date} onChange={e => setFormData({...formData, production_date: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Expiry Date *</label>
                    <input 
                      type="date" 
                      value={formData.expiry_date} onChange={e => setFormData({...formData, expiry_date: e.target.value})}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Flags */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <AlertCircle className="h-4 w-4" /> Properties & Flags
            </div>
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-background/30 p-4">
              <Switch 
                checked={formData.requires_prescription} 
                onCheckedChange={c => setFormData({...formData, requires_prescription: c})} 
                label="Requires Prescription" 
                description="Rx icon will be shown. Pharmacist approval needed for sale."
              />
              <Switch 
                checked={formData.controlled_substance} 
                onCheckedChange={c => setFormData({...formData, controlled_substance: c})} 
                label="Controlled Substance" 
                description="Strict tracking and reporting requirements applied."
              />
              <Switch 
                checked={formData.cold_chain} 
                onCheckedChange={c => setFormData({...formData, cold_chain: c})} 
                label="Cold Chain Required" 
                description="Must be stored in refrigerator (2°C to 8°C)."
              />
              <Switch 
                checked={formData.allow_loose_sale} 
                onCheckedChange={c => setFormData({...formData, allow_loose_sale: c})} 
                label="Allow Loose Sale" 
                description="Can be sold in individual units (e.g., single tablets) rather than full pack."
              />
            </div>
          </section>
        </div>
      </SlideOver>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialog.open}
        onCancel={() => setDeleteDialog({ open: false, id: '', name: '' })}
        onConfirm={handleDelete}
        title="Delete Product"
        message={`Are you sure you want to delete ${deleteDialog.name}? This action cannot be undone.`}
        isLoading={isSaving}
      />

      {/* Bulk Import Modal */}
      <BulkImportModal 
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        onImportComplete={fetchData}
      />
    </div>
  );
}