'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useCurrentLocale } from '@/hooks/use-locale';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Truck,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Boxes,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Package,
  Calendar,
  Building2,
  DollarSign,
  Undo2,
  X,
  ExternalLink,
  ChevronDown
} from 'lucide-react';

export default function PurchasingPage() {
  const { isAr } = useCurrentLocale();

  // Active Tab: 'orders' | 'receipts' | 'terms' | 'returns'
  const [activeTab, setActiveTab] = useState<'orders' | 'receipts' | 'terms' | 'returns'>('orders');

  // Loading states
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Data states
  const [orders, setOrders] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // Filter states
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [receiptStatusFilter, setReceiptStatusFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showNewPoModal, setShowNewPoModal] = useState(false);
  const [showNewGrnModal, setShowNewGrnModal] = useState(false);
  const [showNewTermModal, setShowNewTermModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  // Form states - New PO
  const [poForm, setPoForm] = useState({
    supplier_id: '',
    branch_id: '',
    expected_delivery_date: '',
    payment_terms: 'Net 30',
    notes: '',
    lines: [
      { medicine_id: '', pack_size: 1, packs_ordered: 1, unit_cost: 0, tax_percent: 0 }
    ]
  });

  // Form states - New Goods Receipt
  const [grnForm, setGrnForm] = useState<any>({
    po_id: '',
    supplier_id: '',
    branch_id: '',
    destination_location_id: '',
    supplier_delivery_ref: '',
    notes: '',
    lines: []
  });

  // Form states - New Term
  const [termForm, setTermForm] = useState({
    supplier_id: '',
    medicine_id: '',
    supplier_sku: '',
    pack_size: 1,
    lead_time_days: 2,
    min_order_qty: 1,
    last_cost: 0,
    is_preferred: true
  });

  // Load all data
  const loadData = async () => {
    setLoading(true);
    try {
      const [
        ordersRes,
        receiptsRes,
        termsRes,
        returnsRes,
        analyticsRes,
        suppliersRes,
        branchesRes,
        medicinesRes,
        locationsRes
      ]: any = await Promise.all([
        api.getPurchaseOrders().catch(() => []),
        api.getGoodsReceipts().catch(() => []),
        api.getSupplierTerms().catch(() => []),
        api.getSupplierReturns().catch(() => []),
        api.getPurchaseAnalytics().catch(() => null),
        api.getSuppliers().catch(() => []),
        api.getBranches().catch(() => []),
        api.getMedicines().catch(() => []),
        api.getLocations().catch(() => [])
      ]);

      setOrders(ordersRes);
      setReceipts(receiptsRes);
      setTerms(termsRes);
      setReturns(returnsRes);
      setAnalytics(analyticsRes);
      setSuppliers(suppliersRes);
      setBranches(branchesRes);
      setMedicines(medicinesRes);
      setLocations(locationsRes);

      // Default branch and supplier if available
      if (branchesRes.length > 0 && !poForm.branch_id) {
        setPoForm(prev => ({ ...prev, branch_id: branchesRes[0].id }));
        setGrnForm((prev: any) => ({ ...prev, branch_id: branchesRes[0].id }));
      }
      if (suppliersRes.length > 0 && !poForm.supplier_id) {
        setPoForm(prev => ({ ...prev, supplier_id: suppliersRes[0].id }));
        setTermForm(prev => ({ ...prev, supplier_id: suppliersRes[0].id }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Error loading purchase data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesStatus = orderStatusFilter === 'ALL' || o.status === orderStatusFilter;
      const matchesSupplier = supplierFilter === 'ALL' || o.supplier_id === supplierFilter;
      const matchesSearch = !searchQuery ||
        o.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.supplier_name && o.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesStatus && matchesSupplier && matchesSearch;
    });
  }, [orders, orderStatusFilter, supplierFilter, searchQuery]);

  // Filtered receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter(r => {
      const matchesStatus = receiptStatusFilter === 'ALL' || r.status === receiptStatusFilter;
      const matchesSearch = !searchQuery ||
        r.receipt_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.supplier_name && r.supplier_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.supplier_delivery_ref && r.supplier_delivery_ref.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [receipts, receiptStatusFilter, searchQuery]);

  // Actions: PO
  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poForm.supplier_id || !poForm.branch_id) {
      toast.error(isAr ? 'يرجى اختيار المورد والفرع' : 'Please select supplier and branch');
      return;
    }
    if (poForm.lines.some(l => !l.medicine_id)) {
      toast.error(isAr ? 'يرجى تحديد الدواء لكل بند' : 'Please select medicine for each line');
      return;
    }

    setActionLoading(true);
    try {
      await api.createPurchaseOrder({
        supplier_id: poForm.supplier_id,
        branch_id: poForm.branch_id,
        payment_terms: poForm.payment_terms,
        notes: poForm.notes,
        expected_delivery_date: poForm.expected_delivery_date ? new Date(poForm.expected_delivery_date).toISOString() : null,
        lines: poForm.lines.map(l => ({
          medicine_id: l.medicine_id,
          pack_size: Number(l.pack_size) || 1,
          packs_ordered: Number(l.packs_ordered) || 1,
          unit_cost: Number(l.unit_cost) || 0,
          tax_percent: Number(l.tax_percent) || 0
        }))
      });
      toast.success(isAr ? 'تم إنشاء أمر الشراء بنجاح' : 'Purchase order created successfully');
      setShowNewPoModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error creating purchase order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitPo = async (id: string) => {
    setActionLoading(true);
    try {
      await api.submitPurchaseOrder(id);
      toast.success(isAr ? 'تم إرسال أمر الشراء للمورد' : 'Purchase order submitted to supplier');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error submitting order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprovePo = async (id: string) => {
    setActionLoading(true);
    try {
      await api.approvePurchaseOrder(id);
      toast.success(isAr ? 'تم اعتماد أمر الشراء بنجاح' : 'Purchase order approved');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error approving order');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelPo = async (id: string) => {
    const reason = window.prompt(isAr ? 'يرجى كتابة سبب الإلغاء:' : 'Reason for cancellation:');
    if (!reason) return;
    setActionLoading(true);
    try {
      await api.cancelPurchaseOrder(id, reason);
      toast.success(isAr ? 'تم إلغاء أمر الشراء' : 'Purchase order cancelled');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error cancelling order');
    } finally {
      setActionLoading(false);
    }
  };

  // Pre-fill GRN from PO
  const openReceiveModalForPo = (po: any) => {
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 2);
    const defaultExpiry = oneYearFromNow.toISOString().split('T')[0];

    const wh = locations.find(l => l.branch_id === po.branch_id && l.is_default_receive);

    setGrnForm({
      po_id: po.id,
      po_number: po.po_number,
      supplier_id: po.supplier_id,
      supplier_name: po.supplier_name,
      branch_id: po.branch_id,
      destination_location_id: wh ? wh.id : '',
      supplier_delivery_ref: '',
      notes: '',
      lines: po.lines
        .filter((l: any) => l.quantity_ordered - l.quantity_received > 0)
        .map((l: any) => {
          const remaining = l.quantity_ordered - l.quantity_received;
          return {
            po_line_id: l.id,
            medicine_id: l.medicine_id,
            medicine_name: l.medicine_name,
            quantity_ordered: l.quantity_ordered,
            quantity_received_so_far: l.quantity_received,
            quantity_received: remaining,
            quantity_accepted: remaining,
            quantity_rejected: 0,
            rejection_reason: '',
            batch_number: `LOT-${Date.now().toString().slice(-4)}`,
            expiry_date: defaultExpiry,
            unit_cost: l.unit_cost
          };
        })
    });
    setShowNewGrnModal(true);
  };

  // Actions: GRN
  const handleCreateGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (grnForm.lines.some((l: any) => !l.batch_number || !l.expiry_date)) {
      toast.error(isAr ? 'يرجى إدخال رقم التشغيلة وتاريخ الانتهاء لجميع البنود' : 'Please provide batch number and expiry date for all items');
      return;
    }

    setActionLoading(true);
    try {
      const created = await api.createGoodsReceipt({
        po_id: grnForm.po_id || null,
        supplier_id: grnForm.supplier_id,
        branch_id: grnForm.branch_id,
        destination_location_id: grnForm.destination_location_id || null,
        supplier_delivery_ref: grnForm.supplier_delivery_ref,
        notes: grnForm.notes,
        lines: grnForm.lines.map((l: any) => ({
          po_line_id: l.po_line_id || null,
          medicine_id: l.medicine_id,
          quantity_received: Number(l.quantity_received),
          quantity_accepted: Number(l.quantity_accepted),
          quantity_rejected: Number(l.quantity_rejected) || 0,
          rejection_reason: l.rejection_reason || null,
          batch_number: l.batch_number,
          expiry_date: new Date(l.expiry_date).toISOString(),
          unit_cost: Number(l.unit_cost) || 0
        }))
      });

      // Auto-post receipt to immediately land stock into Main Warehouse
      await api.postGoodsReceipt(created.id);

      toast.success(isAr ? 'تم استلام الشحنة وإيداعها في المستودع الرئيسي بنجاح!' : 'Shipment received and booked into Main Warehouse successfully!');
      setShowNewGrnModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error processing goods receipt');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePostReceipt = async (id: string) => {
    setActionLoading(true);
    try {
      await api.postGoodsReceipt(id);
      toast.success(isAr ? 'تم تأكيد الاستلام وإضافة الرصيد للمستودع' : 'Goods receipt posted to warehouse');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error posting receipt');
    } finally {
      setActionLoading(false);
    }
  };

  // Actions: Supplier Terms
  const handleSaveTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termForm.supplier_id || !termForm.medicine_id) {
      toast.error(isAr ? 'يرجى اختيار المورد والدواء' : 'Please select supplier and medicine');
      return;
    }

    setActionLoading(true);
    try {
      await api.createOrUpdateSupplierTerm({
        supplier_id: termForm.supplier_id,
        medicine_id: termForm.medicine_id,
        supplier_sku: termForm.supplier_sku,
        pack_size: Number(termForm.pack_size) || 1,
        lead_time_days: Number(termForm.lead_time_days) || 1,
        min_order_qty: Number(termForm.min_order_qty) || 1,
        last_cost: Number(termForm.last_cost) || 0,
        is_preferred: termForm.is_preferred
      });
      toast.success(isAr ? 'تم حفظ شروط المورد' : 'Supplier term saved');
      setShowNewTermModal(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error saving term');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400">
              <Truck size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {isAr ? 'مركز المشتريات واستلام البضائع' : 'Procure-to-Stock Purchasing Hub'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? 'إدارة دورة الشراء، استلام الشحنات وتوليد التشغيلات مباشرة إلى المستودع الرئيسي'
                  : 'Manage purchasing lifecycle, inbound receipts, and auto-book batches into warehouse'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewPoModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
          >
            <Plus size={16} />
            <span>{isAr ? 'أمر شراء جديد' : 'New Purchase Order'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active POs */}
        <div className="bg-background border rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? 'أوامر الشراء النشطة' : 'Active POs'}
            </span>
            <div className="text-2xl font-bold mt-1 text-foreground">
              {analytics?.total_orders || orders.length}
            </div>
            <div className="text-xs text-brand-600 mt-1 font-medium">
              {analytics?.draft_rfqs || 0} {isAr ? 'طلبات أسعار مسودة' : 'draft RFQs'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <FileText size={22} />
          </div>
        </div>

        {/* Card 2: Inbound Goods Receipts */}
        <div className="bg-background border rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? 'شحنات قيد الاستلام' : 'Pending Inbound Receipts'}
            </span>
            <div className="text-2xl font-bold mt-1 text-amber-600">
              {analytics?.pending_receipts_count || receipts.filter(r => r.status === 'DRAFT').length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {isAr ? 'بانتظار فحص التشغيلات' : 'Awaiting batch inspection'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Boxes size={22} />
          </div>
        </div>

        {/* Card 3: Total Procurement Spend */}
        <div className="bg-background border rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? 'إجمالي المشتريات المعتمدة' : 'Total Spend Booked'}
            </span>
            <div className="text-2xl font-bold mt-1 text-emerald-600">
              {Number(analytics?.total_spend || 0).toLocaleString()} <span className="text-xs font-normal">SDG</span>
            </div>
            <div className="text-xs text-emerald-600 mt-1 font-medium">
              {isAr ? 'شحنات مدخلة للمستودع' : 'Warehoused stock value'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <DollarSign size={22} />
          </div>
        </div>

        {/* Card 4: Active Suppliers */}
        <div className="bg-background border rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isAr ? 'الموردين المعتمدين' : 'Active Suppliers'}
            </span>
            <div className="text-2xl font-bold mt-1 text-purple-600">
              {analytics?.active_suppliers_count || suppliers.length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {terms.length} {isAr ? 'صنف مسجل بشروط المورد' : 'catalog items with terms'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Building2 size={22} />
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="border-b flex items-center justify-between gap-4 overflow-x-auto">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('orders')}
            className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'orders'
                ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText size={16} />
            <span>{isAr ? 'أوامر الشراء وطلبات الأسعار' : 'Purchase Orders & RFQs'}</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-surface font-mono">{orders.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('receipts')}
            className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'receipts'
                ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Boxes size={16} />
            <span>{isAr ? 'استلام البضائع والتشغيلات (GRN)' : 'Goods Receipts & Inbound'}</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-surface font-mono">{receipts.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('terms')}
            className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'terms'
                ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Building2 size={16} />
            <span>{isAr ? 'شروط وأسعار الموردين' : 'Supplier Product Terms'}</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-surface font-mono">{terms.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('returns')}
            className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'returns'
                ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Undo2 size={16} />
            <span>{isAr ? 'مرتجعات الموردين' : 'Supplier Returns'}</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-surface font-mono">{returns.length}</span>
          </button>
        </div>

        {/* Global Search */}
        <div className="relative min-w-[200px]">
          <Search size={16} className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={isAr ? 'بحث برقم السند أو المورد...' : 'Search order #, supplier...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-sm pl-9 pr-3 rtl:pl-3 rtl:pr-9 py-1.5 border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* TAB 1: PURCHASE ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Status filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setOrderStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  orderStatusFilter === st
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-background border text-muted-foreground hover:bg-surface hover:text-foreground'
                }`}
              >
                {st === 'ALL' && (isAr ? 'الكل' : 'All Orders')}
                {st === 'DRAFT' && (isAr ? 'مسودة (RFQ)' : 'Draft (RFQ)')}
                {st === 'SUBMITTED' && (isAr ? 'مرسل للمورد' : 'Submitted')}
                {st === 'APPROVED' && (isAr ? 'معتمد' : 'Approved')}
                {st === 'PARTIALLY_RECEIVED' && (isAr ? 'مستلم جزئياً' : 'Partially Received')}
                {st === 'RECEIVED' && (isAr ? 'مكتمل الاستلام' : 'Fully Received')}
                {st === 'CANCELLED' && (isAr ? 'ملغي' : 'Cancelled')}
              </button>
            ))}
          </div>

          {/* Orders Table */}
          <div className="bg-background border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-surface/50 text-xs text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'رقم الأمر' : 'PO Number'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'المورد' : 'Supplier'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'تاريخ الأمر' : 'Order Date'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'عدد البنود' : 'Items'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'الإجمالي' : 'Total Amount'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3 px-4 font-semibold text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        {isAr ? 'جاري تحميل أوامر الشراء...' : 'Loading purchase orders...'}
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        {isAr ? 'لا توجد أوامر شراء مطابقة' : 'No purchase orders found'}
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((po) => (
                      <tr key={po.id} className="hover:bg-surface/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-brand-600 dark:text-brand-400">
                          {po.po_number}
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground">
                          {po.supplier_name || '—'}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(po.order_date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-surface border text-xs font-mono">
                            {po.lines?.length || 0} {isAr ? 'صنف' : 'lines'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-foreground">
                          {Number(po.total_amount).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{po.currency}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              po.status === 'RECEIVED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                                : po.status === 'PARTIALLY_RECEIVED'
                                ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-400'
                                : po.status === 'APPROVED'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400'
                                : po.status === 'SUBMITTED'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-400'
                                : po.status === 'CANCELLED'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {po.status === 'DRAFT' && (
                              <button
                                onClick={() => handleSubmitPo(po.id)}
                                disabled={actionLoading}
                                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 rounded text-xs font-medium transition-colors"
                                title="Submit to supplier"
                              >
                                {isAr ? 'إرسال' : 'Submit'}
                              </button>
                            )}

                            {(po.status === 'DRAFT' || po.status === 'SUBMITTED') && (
                              <button
                                onClick={() => handleApprovePo(po.id)}
                                disabled={actionLoading}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 rounded text-xs font-medium transition-colors"
                                title="Approve PO"
                              >
                                {isAr ? 'اعتماد' : 'Approve'}
                              </button>
                            )}

                            {(po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') && (
                              <button
                                onClick={() => openReceiveModalForPo(po)}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 rounded text-xs font-medium transition-colors flex items-center gap-1"
                                title="Receive goods into warehouse"
                              >
                                <Boxes size={12} />
                                <span>{isAr ? 'استلام شحنة' : 'Receive'}</span>
                              </button>
                            )}

                            {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleCancelPo(po.id)}
                                className="px-2 py-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded text-xs transition-colors"
                                title="Cancel order"
                              >
                                {isAr ? 'إلغاء' : 'Cancel'}
                              </button>
                            )}

                            <button
                              onClick={() => setSelectedOrder(po)}
                              className="px-2 py-1 text-muted-foreground hover:bg-surface rounded text-xs"
                              title="View details"
                            >
                              {isAr ? 'تفاصيل' : 'Details'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GOODS RECEIPTS (INBOUND TO WAREHOUSE) */}
      {activeTab === 'receipts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {['ALL', 'DRAFT', 'POSTED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setReceiptStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    receiptStatusFilter === st
                      ? 'bg-brand-600 text-white'
                      : 'bg-background border text-muted-foreground hover:bg-surface'
                  }`}
                >
                  {st === 'ALL' && (isAr ? 'الكل' : 'All Receipts')}
                  {st === 'DRAFT' && (isAr ? 'مسودات قيد الفحص' : 'Drafts in Inspection')}
                  {st === 'POSTED' && (isAr ? 'مرحل للمستودع' : 'Posted to Warehouse')}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setGrnForm({
                  po_id: '',
                  supplier_id: suppliers[0]?.id || '',
                  branch_id: branches[0]?.id || '',
                  destination_location_id: '',
                  supplier_delivery_ref: '',
                  notes: '',
                  lines: [
                    {
                      medicine_id: medicines[0]?.id || '',
                      quantity_received: 50,
                      quantity_accepted: 50,
                      quantity_rejected: 0,
                      rejection_reason: '',
                      batch_number: `LOT-${Date.now().toString().slice(-4)}`,
                      expiry_date: new Date(Date.now() + 365*24*3600*1000).toISOString().split('T')[0],
                      unit_cost: 0
                    }
                  ]
                });
                setShowNewGrnModal(true);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Plus size={14} />
              <span>{isAr ? 'استلام شحنة مباشرة' : 'Direct Goods Receipt'}</span>
            </button>
          </div>

          {/* Receipts Table */}
          <div className="bg-background border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-surface/50 text-xs text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'رقم السند (GRN)' : 'GRN Number'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'أمر الشراء المرتبط' : 'PO Reference'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'المورد' : 'Supplier'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'إشعار تسليم المورد' : 'Delivery Note #'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'مستودع الوجهة' : 'Destination Warehouse'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'تاريخ الاستلام' : 'Received Date'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3 px-4 font-semibold text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        {isAr ? 'جاري تحميل سندات الاستلام...' : 'Loading goods receipts...'}
                      </td>
                    </tr>
                  ) : filteredReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        {isAr ? 'لا توجد سندات استلام بضائع' : 'No goods receipts found'}
                      </td>
                    </tr>
                  ) : (
                    filteredReceipts.map((rec) => (
                      <tr key={rec.id} className="hover:bg-surface/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                          {rec.receipt_number}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-brand-600">
                          {rec.po_number || '— (Direct)'}
                        </td>
                        <td className="py-3 px-4 text-foreground font-medium">
                          {rec.supplier_name || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-muted-foreground">
                          {rec.supplier_delivery_ref || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 font-medium">
                            {rec.destination_location_name || (isAr ? 'المستودع الرئيسي' : 'Main Warehouse')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {new Date(rec.received_date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              rec.status === 'POSTED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400'
                            }`}
                          >
                            {rec.status === 'POSTED' ? (isAr ? 'تم الإيداع' : 'POSTED') : (isAr ? 'قيد الفحص' : 'DRAFT')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {rec.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePostReceipt(rec.id)}
                              disabled={actionLoading}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium transition-colors shadow-sm"
                            >
                              {isAr ? 'تأكيد الترحيل للمستودع' : 'Post to Warehouse'}
                            </button>
                          )}
                          {rec.status === 'POSTED' && (
                            <span className="text-xs text-emerald-600 flex items-center justify-center gap-1 font-medium">
                              <CheckCircle2 size={14} />
                              <span>{isAr ? 'في المستودع' : 'Warehoused'}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SUPPLIER TERMS */}
      {activeTab === 'terms' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {isAr
                ? 'شروط التوريد، حجم العبوات، مهلة التوصيل باليوم، وآخر تكلفة شراء لكل دواء مع كل مورد'
                : 'Vendor product terms, pack multiples, lead times, and last purchase cost per medicine'}
            </p>
            <button
              onClick={() => setShowNewTermModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Plus size={14} />
              <span>{isAr ? 'إضافة شرط مورد' : 'New Supplier Term'}</span>
            </button>
          </div>

          <div className="bg-background border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-surface/50 text-xs text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'المورد' : 'Supplier'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'الدواء' : 'Medicine'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'كود المورد' : 'Vendor SKU'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'حجم العبوة' : 'Pack Size'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'مهلة التوريد' : 'Lead Time'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'أدنى طلب' : 'MOQ'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'آخر تكلفة' : 'Last Cost'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'المورد المفضل' : 'Preferred'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {terms.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        {isAr ? 'لا توجد شروط موردين مسجلة' : 'No supplier terms configured'}
                      </td>
                    </tr>
                  ) : (
                    terms.map((t) => (
                      <tr key={t.id} className="hover:bg-surface/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">{t.supplier_name}</td>
                        <td className="py-3 px-4 font-semibold text-brand-600">{t.medicine_name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{t.supplier_sku || '—'}</td>
                        <td className="py-3 px-4">{t.pack_size} {isAr ? 'وحدة/عبوة' : 'units/pack'}</td>
                        <td className="py-3 px-4">{t.lead_time_days} {isAr ? 'أيام' : 'days'}</td>
                        <td className="py-3 px-4">{t.min_order_qty}</td>
                        <td className="py-3 px-4 font-semibold text-emerald-600">
                          {Number(t.last_cost).toFixed(2)} {t.currency}
                        </td>
                        <td className="py-3 px-4">
                          {t.is_preferred ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 font-medium">
                              {isAr ? 'نعم (مفضل)' : 'Preferred'}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">{isAr ? 'لا' : 'Standard'}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SUPPLIER RETURNS */}
      {activeTab === 'returns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {isAr
                ? 'إرجاع البضائع التالفة أو القريبة من الانتهاء للمورد، وخصمها رسمياً من أرصدة المستودع'
                : 'Return damaged or near-expiry batches to distributors and deduct from warehouse inventory'}
            </p>
          </div>

          <div className="bg-background border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right">
                <thead className="bg-surface/50 text-xs text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'رقم الإرجاع' : 'Return Number'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'المورد' : 'Supplier'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'المستودع المصدر' : 'Source Warehouse'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'السبب' : 'Reason'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'القيمة' : 'Amount'}</th>
                    <th className="py-3 px-4 font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {returns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {isAr ? 'لا توجد مرتجعات موردين' : 'No supplier returns on record'}
                      </td>
                    </tr>
                  ) : (
                    returns.map((ret) => (
                      <tr key={ret.id} className="hover:bg-surface/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-rose-600">{ret.return_number}</td>
                        <td className="py-3 px-4 font-medium text-foreground">{ret.supplier_name}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{ret.from_location_name || 'Main Warehouse'}</td>
                        <td className="py-3 px-4 text-sm">{ret.reason}</td>
                        <td className="py-3 px-4 font-semibold text-foreground">{Number(ret.total_amount).toFixed(2)} SDG</td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400">
                            {ret.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: NEW PURCHASE ORDER */}
      {showNewPoModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background border rounded-2xl max-w-3xl w-full shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FileText className="text-brand-600" size={20} />
                <span>{isAr ? 'إنشاء أمر شراء جديد (PO / RFQ)' : 'Create Purchase Order / RFQ'}</span>
              </h2>
              <button onClick={() => setShowNewPoModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePo} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    {isAr ? 'المورد *' : 'Supplier *'}
                  </label>
                  <select
                    value={poForm.supplier_id}
                    onChange={(e) => setPoForm({ ...poForm, supplier_id: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 bg-background"
                    required
                  >
                    <option value="">{isAr ? 'اختر المورد...' : 'Select Supplier...'}</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    {isAr ? 'الفرع المستلم *' : 'Receiving Branch *'}
                  </label>
                  <select
                    value={poForm.branch_id}
                    onChange={(e) => setPoForm({ ...poForm, branch_id: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 bg-background"
                    required
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    {isAr ? 'شروط الدفع' : 'Payment Terms'}
                  </label>
                  <select
                    value={poForm.payment_terms}
                    onChange={(e) => setPoForm({ ...poForm, payment_terms: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 bg-background"
                  >
                    <option value="Net 30">Net 30 (30 يوم)</option>
                    <option value="Net 15">Net 15 (15 يوم)</option>
                    <option value="Cash on Delivery">Cash on Delivery (نقد عند الاستلام)</option>
                    <option value="Advance">Advance (دفعة مقدمة)</option>
                  </select>
                </div>
              </div>

              {/* Order Lines */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {isAr ? 'بنود أمر الشراء' : 'Order Line Items'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPoForm(prev => ({
                        ...prev,
                        lines: [...prev.lines, { medicine_id: '', pack_size: 1, packs_ordered: 1, unit_cost: 0, tax_percent: 0 }]
                      }));
                    }}
                    className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1"
                  >
                    <Plus size={14} />
                    <span>{isAr ? 'إضافة صنف آخر' : 'Add another item'}</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {poForm.lines.map((line, idx) => (
                    <div key={idx} className="p-3 border rounded-xl bg-surface/30 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <label className="text-[11px] text-muted-foreground block mb-0.5">{isAr ? 'الدواء' : 'Medicine'}</label>
                        <select
                          value={line.medicine_id}
                          onChange={(e) => {
                            const newLines = [...poForm.lines];
                            newLines[idx].medicine_id = e.target.value;
                            // Check if there is a known term for this medicine
                            const foundTerm = terms.find(t => t.medicine_id === e.target.value && t.supplier_id === poForm.supplier_id);
                            if (foundTerm) {
                              newLines[idx].pack_size = foundTerm.pack_size;
                              newLines[idx].unit_cost = Number(foundTerm.last_cost);
                            }
                            setPoForm({ ...poForm, lines: newLines });
                          }}
                          className="w-full text-xs border rounded-lg p-1.5 bg-background"
                          required
                        >
                          <option value="">{isAr ? 'اختر الدواء...' : 'Select Medicine...'}</option>
                          {medicines.map(m => (
                            <option key={m.id} value={m.id}>{m.name_en}</option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-2">
                        <label className="text-[11px] text-muted-foreground block mb-0.5">{isAr ? 'العبوات' : 'Packs'}</label>
                        <input
                          type="number"
                          min="1"
                          value={line.packs_ordered}
                          onChange={(e) => {
                            const newLines = [...poForm.lines];
                            newLines[idx].packs_ordered = Number(e.target.value);
                            setPoForm({ ...poForm, lines: newLines });
                          }}
                          className="w-full text-xs border rounded-lg p-1.5 bg-background"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="text-[11px] text-muted-foreground block mb-0.5">{isAr ? 'حجم العبوة' : 'Pack Size'}</label>
                        <input
                          type="number"
                          min="1"
                          value={line.pack_size}
                          onChange={(e) => {
                            const newLines = [...poForm.lines];
                            newLines[idx].pack_size = Number(e.target.value);
                            setPoForm({ ...poForm, lines: newLines });
                          }}
                          className="w-full text-xs border rounded-lg p-1.5 bg-background"
                        />
                      </div>

                      <div className="col-span-3">
                        <label className="text-[11px] text-muted-foreground block mb-0.5">{isAr ? 'سعر الوحدة' : 'Unit Cost'}</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unit_cost}
                          onChange={(e) => {
                            const newLines = [...poForm.lines];
                            newLines[idx].unit_cost = Number(e.target.value);
                            setPoForm({ ...poForm, lines: newLines });
                          }}
                          className="w-full text-xs border rounded-lg p-1.5 bg-background"
                        />
                      </div>

                      <div className="col-span-1 text-center pt-3">
                        {poForm.lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPoForm(prev => ({
                                ...prev,
                                lines: prev.lines.filter((_, i) => i !== idx)
                              }));
                            }}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  {isAr ? 'ملاحظات وتوجيهات الشحن' : 'Notes & Instructions'}
                </label>
                <textarea
                  rows={2}
                  value={poForm.notes}
                  onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                  placeholder={isAr ? 'مثال: شحن مبرد، أو استلام عند الباب الخلفي للمستودع...' : 'e.g. Keep cool, deliver to warehouse receiving dock...'}
                  className="w-full text-sm border rounded-lg p-2 bg-background"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewPoModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-muted-foreground hover:bg-surface"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                  {actionLoading ? (isAr ? 'جاري الإنشاء...' : 'Creating...') : (isAr ? 'حفظ أمر الشراء' : 'Save Purchase Order')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: GOODS RECEIPT (INBOUND TO WAREHOUSE) */}
      {showNewGrnModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-background border rounded-2xl max-w-4xl w-full shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Boxes className="text-emerald-600" size={20} />
                  <span>{isAr ? 'استلام شحنة بضاعة وتوليد التشغيلات للمستودع' : 'Goods Receipt & Warehouse Inbound'}</span>
                </h2>
                {grnForm.po_number && (
                  <p className="text-xs text-brand-600 font-mono mt-0.5">
                    {isAr ? `تابع لأمر الشراء: ${grnForm.po_number}` : `Linked to PO: ${grnForm.po_number}`}
                  </p>
                )}
              </div>
              <button onClick={() => setShowNewGrnModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateGrn} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    {isAr ? 'رقم إشعار تسليم المورد (Invoice / Slip #)' : 'Vendor Delivery Note / Slip # *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INV-2026-9921"
                    value={grnForm.supplier_delivery_ref}
                    onChange={(e) => setGrnForm({ ...grnForm, supplier_delivery_ref: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 bg-background font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    {isAr ? 'مستودع الوجهة' : 'Destination Stock Location'}
                  </label>
                  <select
                    value={grnForm.destination_location_id}
                    onChange={(e) => setGrnForm({ ...grnForm, destination_location_id: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 bg-background"
                  >
                    <option value="">{isAr ? 'المستودع الرئيسي الافتراضي' : 'Default Main Warehouse'}</option>
                    {locations.map(l => (
                      <option key={l.id} value={l.id}>{l.name_en} ({l.location_type})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    {isAr ? 'ملاحظات الفحص الظاهري' : 'Inspection Notes'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? 'مثال: الشحنة سليمة ومبردة' : 'e.g. Good cold chain condition'}
                    value={grnForm.notes}
                    onChange={(e) => setGrnForm({ ...grnForm, notes: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 bg-background"
                  />
                </div>
              </div>

              {/* Inbound Lines */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider block">
                  {isAr ? 'بيانات الأصناف والتشغيلات وتواريخ الانتهاء' : 'Line Items, Lot/Batch Numbers & Expiries'}
                </span>

                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {grnForm.lines.map((line: any, idx: number) => (
                    <div key={idx} className="p-3.5 border rounded-xl bg-surface/40 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-foreground">
                          {line.medicine_name || medicines.find(m => m.id === line.medicine_id)?.name_en || `Item #${idx+1}`}
                        </span>
                        {line.quantity_ordered && (
                          <span className="text-xs text-muted-foreground">
                            {isAr ? `المطلوب بالأمر: ${line.quantity_ordered}` : `Ordered: ${line.quantity_ordered}`}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div>
                          <label className="text-[11px] text-muted-foreground block mb-0.5">{isAr ? 'الكمية المستلمة' : 'Qty Received'}</label>
                          <input
                            type="number"
                            min="1"
                            value={line.quantity_received}
                            onChange={(e) => {
                              const newLines = [...grnForm.lines];
                              newLines[idx].quantity_received = Number(e.target.value);
                              newLines[idx].quantity_accepted = Number(e.target.value);
                              setGrnForm({ ...grnForm, lines: newLines });
                            }}
                            className="w-full text-xs border rounded-lg p-1.5 bg-background font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-muted-foreground block mb-0.5">{isAr ? 'الكمية المقبولة' : 'Qty Accepted'}</label>
                          <input
                            type="number"
                            min="0"
                            value={line.quantity_accepted}
                            onChange={(e) => {
                              const newLines = [...grnForm.lines];
                              newLines[idx].quantity_accepted = Number(e.target.value);
                              newLines[idx].quantity_rejected = Math.max(0, newLines[idx].quantity_received - Number(e.target.value));
                              setGrnForm({ ...grnForm, lines: newLines });
                            }}
                            className="w-full text-xs border rounded-lg p-1.5 bg-background font-mono text-emerald-600 font-semibold"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-muted-foreground block mb-0.5">{isAr ? 'رقم التشغيلة (Batch) *' : 'Batch/Lot # *'}</label>
                          <input
                            type="text"
                            required
                            value={line.batch_number}
                            onChange={(e) => {
                              const newLines = [...grnForm.lines];
                              newLines[idx].batch_number = e.target.value.toUpperCase();
                              setGrnForm({ ...grnForm, lines: newLines });
                            }}
                            className="w-full text-xs border rounded-lg p-1.5 bg-background font-mono font-bold"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-muted-foreground block mb-0.5">{isAr ? 'تاريخ الانتهاء *' : 'Expiry Date *'}</label>
                          <input
                            type="date"
                            required
                            value={line.expiry_date}
                            onChange={(e) => {
                              const newLines = [...grnForm.lines];
                              newLines[idx].expiry_date = e.target.value;
                              setGrnForm({ ...grnForm, lines: newLines });
                            }}
                            className="w-full text-xs border rounded-lg p-1.5 bg-background font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-muted-foreground block mb-0.5">{isAr ? 'سعر الشراء الفعلي' : 'Actual Unit Cost'}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={line.unit_cost}
                            onChange={(e) => {
                              const newLines = [...grnForm.lines];
                              newLines[idx].unit_cost = Number(e.target.value);
                              setGrnForm({ ...grnForm, lines: newLines });
                            }}
                            className="w-full text-xs border rounded-lg p-1.5 bg-background font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewGrnModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-muted-foreground hover:bg-surface"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm flex items-center gap-2"
                >
                  <Boxes size={16} />
                  <span>{actionLoading ? (isAr ? 'جاري الإيداع...' : 'Booking...') : (isAr ? 'تأكيد الاستلام والإيداع بالمستودع' : 'Receive & Post to Warehouse')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: NEW SUPPLIER TERM */}
      {showNewTermModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background border rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Building2 className="text-purple-600" size={20} />
                <span>{isAr ? 'إضافة / تعديل شرط مورد' : 'Set Supplier Product Term'}</span>
              </h2>
              <button onClick={() => setShowNewTermModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveTerm} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">{isAr ? 'المورد *' : 'Supplier *'}</label>
                <select
                  value={termForm.supplier_id}
                  onChange={(e) => setTermForm({ ...termForm, supplier_id: e.target.value })}
                  className="w-full text-sm border rounded-lg p-2 bg-background"
                  required
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">{isAr ? 'الدواء *' : 'Medicine *'}</label>
                <select
                  value={termForm.medicine_id}
                  onChange={(e) => setTermForm({ ...termForm, medicine_id: e.target.value })}
                  className="w-full text-sm border rounded-lg p-2 bg-background"
                  required
                >
                  <option value="">{isAr ? 'اختر الدواء...' : 'Select Medicine...'}</option>
                  {medicines.map(m => (
                    <option key={m.id} value={m.id}>{m.name_en}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">{isAr ? 'كود الصنف عند المورد' : 'Vendor SKU'}</label>
                  <input
                    type="text"
                    value={termForm.supplier_sku}
                    onChange={(e) => setTermForm({ ...termForm, supplier_sku: e.target.value })}
                    className="w-full text-sm border rounded-lg p-2 bg-background font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">{isAr ? 'حجم العبوة (Pack Size)' : 'Pack Size'}</label>
                  <input
                    type="number"
                    min="1"
                    value={termForm.pack_size}
                    onChange={(e) => setTermForm({ ...termForm, pack_size: Number(e.target.value) })}
                    className="w-full text-sm border rounded-lg p-2 bg-background"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">{isAr ? 'مهلة التوريد (بالأيام)' : 'Lead Time (Days)'}</label>
                  <input
                    type="number"
                    min="1"
                    value={termForm.lead_time_days}
                    onChange={(e) => setTermForm({ ...termForm, lead_time_days: Number(e.target.value) })}
                    className="w-full text-sm border rounded-lg p-2 bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">{isAr ? 'أدنى كمية للطلب (MOQ)' : 'Minimum Order Qty'}</label>
                  <input
                    type="number"
                    min="1"
                    value={termForm.min_order_qty}
                    onChange={(e) => setTermForm({ ...termForm, min_order_qty: Number(e.target.value) })}
                    className="w-full text-sm border rounded-lg p-2 bg-background"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">{isAr ? 'آخر تكلفة شراء للوحدة (SDG)' : 'Last Purchase Unit Cost'}</label>
                <input
                  type="number"
                  step="0.01"
                  value={termForm.last_cost}
                  onChange={(e) => setTermForm({ ...termForm, last_cost: Number(e.target.value) })}
                  className="w-full text-sm border rounded-lg p-2 bg-background font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="pref_check"
                  checked={termForm.is_preferred}
                  onChange={(e) => setTermForm({ ...termForm, is_preferred: e.target.checked })}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="pref_check" className="text-xs text-foreground cursor-pointer">
                  {isAr ? 'تعيين كمورد مفضل لهذا الدواء' : 'Mark as preferred vendor for this medicine'}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowNewTermModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-muted-foreground hover:bg-surface"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {isAr ? 'حفظ الشروط' : 'Save Term'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRAWER / DETAILS MODAL: PO DETAILS */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background border rounded-2xl max-w-2xl w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <div>
                <h3 className="font-bold text-lg text-foreground font-mono">{selectedOrder.po_number}</h3>
                <p className="text-xs text-muted-foreground">{selectedOrder.supplier_name} • {new Date(selectedOrder.order_date).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">{isAr ? 'تفاصيل بنود أمر الشراء' : 'Order Line Items'}</div>
              <div className="border rounded-xl divide-y divide-border overflow-hidden">
                {selectedOrder.lines?.map((line: any) => (
                  <div key={line.id} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-foreground">{line.medicine_name}</div>
                      <div className="text-muted-foreground font-mono">
                        {line.packs_ordered} packs × {line.pack_size} = {line.quantity_ordered} units
                      </div>
                    </div>
                    <div className="text-right rtl:text-left">
                      <div className="font-semibold text-foreground">{Number(line.line_total).toFixed(2)} SDG</div>
                      <div className="text-emerald-600 font-medium">
                        {line.quantity_received} / {line.quantity_ordered} {isAr ? 'مستلم' : 'received'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-surface/50 p-3 rounded-xl flex items-center justify-between text-sm font-semibold">
                <span>{isAr ? 'الإجمالي الكلي:' : 'Total Amount:'}</span>
                <span className="text-brand-600 font-mono">{Number(selectedOrder.total_amount).toFixed(2)} SDG</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 border rounded-lg text-sm text-foreground hover:bg-surface"
              >
                {isAr ? 'إلغاء' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
