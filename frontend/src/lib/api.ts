const API_BASE = '/api/v1'; // Use Next.js rewrite proxy

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });
  
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/en/login';
    }
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    
    let errorMsg = `API Error: ${res.status}`;
    if (error?.detail) {
      if (Array.isArray(error.detail)) {
        errorMsg = error.detail.map((e: any) => `${e.loc?.join('.')} ${e.msg}`).join(', ');
      } else if (typeof error.detail === 'string') {
        errorMsg = error.detail;
      }
    } else if (error?.error?.message) {
      errorMsg = error.error.message;
    }
    
    const err: any = new Error(errorMsg);
    err.status = res.status;
    err.data = error;
    throw err;
  }
  return res.json();
}

export const api = {
  // Auth
  login: (data: { email: string; password: string; remember_me?: boolean }) => fetchApi('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => fetchApi('/auth/logout', { method: 'POST' }),
  getMe: () => fetchApi('/auth/me'),
  
  // Users
  getUsers: () => fetchApi('/users'),
  getUser: (id: string) => fetchApi(`/users/${id}`),
  updateUser: (id: string, data: any) => fetchApi(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => fetchApi(`/users/${id}`, { method: 'DELETE' }),
  registerUser: (data: any) => fetchApi('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  
  // Medicines
  getMedicines: () => fetchApi('/medicines'),
  getMedicine: (id: string) => fetchApi(`/medicines/${id}`),
  searchMedicines: (q: string) => fetchApi(`/medicines/search?q=${encodeURIComponent(q)}`),
  createMedicine: (data: any) => fetchApi('/medicines', { method: 'POST', body: JSON.stringify(data) }),
  createMedicineWithBatch: (data: any) => fetchApi('/medicines/with-batch', { method: 'POST', body: JSON.stringify(data) }),
  bulkImportMedicines: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/medicines/bulk-import`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(error?.error?.message || `API Error: ${res.status}`);
    }
    return res.json();
  },
  downloadImportTemplate: async (format: 'csv' | 'xlsx' = 'csv') => {
    const res = await fetch(`${API_BASE}/medicines/import-template?format=${format}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to download template');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medicine_import_template.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
  },
  updateMedicine: (id: string, data: any) => fetchApi(`/medicines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMedicine: (id: string) => fetchApi(`/medicines/${id}`, { method: 'DELETE' }),
  getCategories: () => fetchApi('/medicines/categories'),
  getCategoryTree: () => fetchApi('/medicines/categories/tree'),
  createCategory: (data: any) => fetchApi('/medicines/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: any) => fetchApi(`/medicines/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: string) => fetchApi(`/medicines/categories/${id}`, { method: 'DELETE' }),
  getBatches: (medicineId: string) => fetchApi(`/medicines/${medicineId}/batches`),
  createBatch: (medicineId: string, data: any) => fetchApi(`/medicines/${medicineId}/batches`, { method: 'POST', body: JSON.stringify(data) }),
  updateBatch: (medicineId: string, batchId: string, data: any) => fetchApi(`/medicines/${medicineId}/batches/${batchId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateBatch: (medicineId: string, batchId: string) => fetchApi(`/medicines/${medicineId}/batches/${batchId}`, { method: 'DELETE' }),

  // Barcodes
  scanBarcode: (barcode: string, branchId?: string) =>
    fetchApi<any>(`/medicines/barcode/scan/${encodeURIComponent(barcode)}${branchId ? `?branch_id=${branchId}` : ''}`),
  checkBarcode: (barcode: string, excludeType?: string, excludeId?: string) => {
    const q = new URLSearchParams({ barcode });
    if (excludeType) q.append('exclude_type', excludeType);
    if (excludeId) q.append('exclude_id', excludeId);
    return fetchApi<{ barcode: string; is_unique: boolean; conflict_type: string | null; conflict_details: any }>(
      `/medicines/check-barcode?${q.toString()}`
    );
  },
  getMedicineBarcodes: (medicineId: string) => fetchApi<any[]>(`/medicines/${medicineId}/barcodes`),
  addMedicineBarcode: (medicineId: string, data: any) =>
    fetchApi<any>(`/medicines/${medicineId}/barcodes`, { method: 'POST', body: JSON.stringify(data) }),
  deleteMedicineBarcode: (medicineId: string, barcodeId: string) =>
    fetchApi<any>(`/medicines/${medicineId}/barcodes/${barcodeId}`, { method: 'DELETE' }),
  
  // Inventory
  getStock: (branchId?: string) => fetchApi(`/inventory/stock${branchId ? `?branch_id=${branchId}` : ''}`),
  getMedicineStock: (id: string, branchId?: string) => fetchApi(`/inventory/stock/${id}${branchId ? `?branch_id=${branchId}` : ''}`),
  createAdjustment: (data: any) => fetchApi('/inventory/adjustments', { method: 'POST', body: JSON.stringify(data) }),
  getMovements: (params?: { medicine_id?: string; movement_type?: string; branch_id?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.medicine_id) q.append('medicine_id', params.medicine_id);
    if (params?.movement_type && params.movement_type !== 'ALL') q.append('movement_type', params.movement_type);
    if (params?.branch_id) q.append('branch_id', params.branch_id);
    if (params?.limit) q.append('limit', String(params.limit));
    const qs = q.toString();
    return fetchApi(`/inventory/movements${qs ? `?${qs}` : ''}`);
  },
  getMedicineMovements: (medicineId: string) => fetchApi(`/inventory/movements?medicine_id=${medicineId}`),
  // Inventory Alerts & Expiry Control
  getLowStock: () => fetchApi('/inventory/alerts/low-stock'),
  getOutOfStock: () => fetchApi('/inventory/alerts/out-of-stock'),
  getExpiring: () => fetchApi('/inventory/alerts/expiring'),
  getExpired: () => fetchApi('/inventory/alerts/expired'),
  getExpiryDashboard: (params?: { branch_id?: string; bucket_filter?: string }) => {
    const q = new URLSearchParams();
    if (params?.branch_id) q.append('branch_id', params.branch_id);
    if (params?.bucket_filter && params.bucket_filter !== 'ALL') q.append('bucket_filter', params.bucket_filter);
    const qs = q.toString();
    return fetchApi(`/inventory/expiry-dashboard${qs ? `?${qs}` : ''}`);
  },
  updateBatchStatus: (batchId: string, data: { status: string; reason: string; reference?: string; quantity_to_dispose?: number }) =>
    fetchApi(`/inventory/batches/${batchId}/status`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // Stock Locations & Refill
  getLocations: (branchId?: string) =>
    fetchApi<any[]>(`/inventory/locations${branchId ? `?branch_id=${branchId}` : ''}`),
  getLocationStockSummary: (params?: { branch_id?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.branch_id) q.append('branch_id', params.branch_id);
    if (params?.search) q.append('search', params.search);
    const qs = q.toString();
    return fetchApi<any[]>(`/inventory/locations/stock-summary${qs ? `?${qs}` : ''}`);
  },
  getRefillSuggestions: (branchId?: string) =>
    fetchApi<any[]>(`/inventory/locations/refill-suggestions${branchId ? `?branch_id=${branchId}` : ''}`),
  quickRefill: (data: { medicine_id: string; quantity: number; batch_id?: string; branch_id?: string; notes?: string }) =>
    fetchApi<any>('/inventory/transfers/quick-refill', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  bulkRefill: (data: { items: { medicine_id: string; quantity: number; batch_id?: string }[]; branch_id?: string; notes?: string }) =>
    fetchApi<any>('/inventory/transfers/bulk-refill', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  moveToWarehouse: (data: { medicine_id: string; quantity: number; batch_id?: string; branch_id?: string; notes?: string }) =>
    fetchApi<{ success: boolean; message: string; transferred_quantity: number }>('/inventory/transfers/shelf-to-warehouse', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  consolidateStockToShelf: (branchId?: string) =>
    fetchApi<{ success: boolean; message: string; batches_count: number; total_shelf_stock: number }>('/inventory/locations/consolidate-to-shelf', {
      method: 'POST',
      body: JSON.stringify({ branch_id: branchId }),
    }),
  exportInventoryStock: async (format: 'xlsx' | 'csv' = 'xlsx', branchId?: string) => {
    const q = new URLSearchParams();
    q.append('format', format);
    if (branchId) q.append('branch_id', branchId);
    const res = await fetch(`${API_BASE}/inventory/export?${q.toString()}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to export inventory stock');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `inventory_stock_${dateStr}.${format}`;
    a.click();
    window.URL.revokeObjectURL(url);
  },
  
  // Sales
  processSale: (data: any) => fetchApi('/sales/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  getSales: (params?: { start_date?: string, end_date?: string, status?: string, search?: string }) => {
    let url = '/sales/';
    if (params) {
      const q = new URLSearchParams();
      if (params.start_date) q.append('start_date', params.start_date);
      if (params.end_date) q.append('end_date', params.end_date);
      if (params.status && params.status !== 'ALL') q.append('status', params.status);
      if (params.search) q.append('search', params.search);
      if (q.toString()) url += `?${q.toString()}`;
    }
    return fetchApi(url);
  },
  returnSale: (id: string, data?: any) => fetchApi(`/sales/${id}/return`, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  }),
  getSaleById: (id: string) => fetchApi(`/sales/${id}`),
  getSaleReturns: (id: string) => fetchApi(`/sales/${id}/returns`),
  
  // Suppliers
  getSuppliers: () => fetchApi('/suppliers'),
  createSupplier: (data: any) => fetchApi('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  
  // Customers
  getCustomers: () => fetchApi('/customers'),
  getCustomer: (id: string) => fetchApi(`/customers/${id}`),
  searchCustomers: (q: string) => fetchApi(`/customers/search?q=${encodeURIComponent(q)}`),
  createCustomer: (data: any) => fetchApi('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: any) => fetchApi(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomer: (id: string) => fetchApi(`/customers/${id}`, { method: 'DELETE' }),
  getCustomerPurchases: (id: string) => fetchApi(`/customers/${id}/purchases`),
  getCustomerPayments: (id: string) => fetchApi(`/customers/${id}/payments`),
  addCustomerPayment: (id: string, data: any) => fetchApi(`/customers/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  getCustomerCreditLedger: (id: string) => fetchApi(`/customers/${id}/credit-ledger`),
  getCustomerStatement: (id: string, params?: { start_date?: string; end_date?: string; status_filter?: string }) => {
    const q = new URLSearchParams();
    if (params?.start_date) q.append('start_date', params.start_date);
    if (params?.end_date) q.append('end_date', params.end_date);
    if (params?.status_filter && params.status_filter !== 'ALL') q.append('status_filter', params.status_filter);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchApi(`/customers/${id}/statement${qs}`);
  },
  updateCustomerNotes: (id: string, notes: string) => fetchApi(`/customers/${id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  
  // Cash Sessions
  openSession: (data: any) => fetchApi('/cash-sessions/open', { method: 'POST', body: JSON.stringify(data) }),
  closeSession: (id: string, data: any) => fetchApi(`/cash-sessions/${id}/close`, { method: 'POST', body: JSON.stringify(data) }),
  getActiveSession: () => fetchApi('/cash-sessions/active'),
  getSessions: (params?: { status?: string; branch_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.branch_id) q.append('branch_id', params.branch_id);
    const qs = q.toString();
    return fetchApi(`/cash-sessions${qs ? `?${qs}` : ''}`);
  },
  getSessionSummary: (id: string) => fetchApi(`/cash-sessions/${id}/summary`),
  getLastClosedSession: (params?: { terminal_name?: string; branch_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.terminal_name) q.append('terminal_name', params.terminal_name);
    if (params?.branch_id) q.append('branch_id', params.branch_id);
    const qs = q.toString();
    return fetchApi(`/cash-sessions/last-closed${qs ? `?${qs}` : ''}`);
  },
  getPaymentsLedger: (params?: { payment_method?: string; cash_session_id?: string; branch_id?: string; start_date?: string; end_date?: string }) => {
    const q = new URLSearchParams();
    if (params?.payment_method) q.append('payment_method', params.payment_method);
    if (params?.cash_session_id) q.append('cash_session_id', params.cash_session_id);
    if (params?.branch_id) q.append('branch_id', params.branch_id);
    if (params?.start_date) q.append('start_date', params.start_date);
    if (params?.end_date) q.append('end_date', params.end_date);
    const qs = q.toString();
    return fetchApi(`/sales/payments/ledger${qs ? `?${qs}` : ''}`);
  },
  getPayments: (params?: { payment_method?: string; cash_session_id?: string; branch_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.payment_method) q.append('payment_method', params.payment_method);
    if (params?.cash_session_id) q.append('cash_session_id', params.cash_session_id);
    if (params?.branch_id) q.append('branch_id', params.branch_id);
    const qs = q.toString();
    return fetchApi(`/sales/payments${qs ? `?${qs}` : ''}`);
  },
  addCashMovement: (id: string, data: { movement_type: 'CASH_IN' | 'CASH_OUT'; amount: number; reason: string }) =>
    fetchApi(`/cash-sessions/${id}/movements`, { method: 'POST', body: JSON.stringify(data) }),
  
  // Reports
  getDailySales: (date: string) => fetchApi(`/reports/sales/daily?date=${date}`),
  getMonthlySales: (year: number, month: number) => fetchApi(`/reports/sales/monthly?year=${year}&month=${month}`),
  getSalesRange: (start: string, end: string) => fetchApi(`/reports/sales/range?start_date=${start}&end_date=${end}`),
  getStockValue: () => fetchApi('/reports/inventory/stock-value'),
  getExpirySummary: () => fetchApi('/reports/inventory/expiry-summary'),
  getTopProducts: (limit = 10) => fetchApi(`/reports/sales/top-products?limit=${limit}`),
  getProfit: (start?: string, end?: string) => {
    let url = '/reports/financial/profit';
    if (start && end) url += `?start_date=${start}&end_date=${end}`;
    return fetchApi(url);
  },
  getCustomerBalances: () => fetchApi('/reports/customers/balances'),
  getPaymentBreakdown: (start?: string, end?: string) => {
    let url = '/reports/financial/payment-breakdown';
    if (start && end) url += `?start_date=${start}&end_date=${end}`;
    return fetchApi(url);
  },
  getMedicineMovement: (start?: string, end?: string) => {
    let url = '/reports/medicines/movement';
    if (start && end) url += `?start_date=${start}&end_date=${end}`;
    return fetchApi(url);
  },
  
  // Admin
  wipeData: () => fetchApi('/admin/wipe-data', { method: 'POST' }),
  factoryReset: () => fetchApi('/admin/factory-reset', { method: 'POST' }),

  // Admin - Audit Logs
  getAuditLogs: (params?: { page?: number; per_page?: number; module?: string; action?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.append('page', String(params.page));
    if (params?.per_page) q.append('per_page', String(params.per_page));
    if (params?.module && params.module !== 'all') q.append('module', params.module);
    if (params?.action && params.action !== 'all') q.append('action', params.action);
    if (params?.search) q.append('search', params.search);
    return fetchApi(`/admin/audit-logs?${q.toString()}`);
  },

  // Admin - Backups
  createBackup: () => fetchApi('/admin/backups', { method: 'POST' }),
  getBackups: () => fetchApi('/admin/backups'),
  deleteBackup: (filename: string) => fetchApi(`/admin/backups/${filename}`, { method: 'DELETE' }),
  downloadBackup: async (filename: string) => {
    const res = await fetch(`/api/v1/admin/backups/${filename}/download`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to download backup');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  },
  restoreBackup: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/v1/admin/backups/restore`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error?.detail || `API Error: ${res.status}`);
    }
    return res.json();
  },
  restoreStockFromExcel: async (file: File, branchId?: string, inventoryMode?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    const params = new URLSearchParams();
    if (branchId) params.append('branch_id', branchId);
    if (inventoryMode) params.append('inventory_mode', inventoryMode);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/inventory/restore-stock${query}`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error?.detail || `API Error: ${res.status}`);
    }
    return res.json();
  },
  // Branches
  getBranches: () => fetchApi('/branches'),
  getBranch: (id: string) => fetchApi(`/branches/${id}`),
  createBranch: (data: any) => fetchApi('/branches', { method: 'POST', body: JSON.stringify(data) }),
  updateBranch: (id: string, data: any) => fetchApi(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Roles & Permissions
  getRoles: () => fetchApi('/roles'),
  getRole: (id: string) => fetchApi(`/roles/${id}`),
  createRole: (data: any) => fetchApi('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id: string, data: any) => fetchApi(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRole: (id: string) => fetchApi(`/roles/${id}`, { method: 'DELETE' }),
  getPermissions: () => fetchApi('/roles/permissions/all'),
  getPermissionsByModule: () => fetchApi('/roles/permissions/by-module'),

  // Notifications
  getNotifications: () => fetchApi('/notifications'),
  getUnreadNotificationCount: () => fetchApi('/notifications/unread-count'),
  markNotificationAsRead: (id: string) => fetchApi(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsAsRead: () => fetchApi('/notifications/read-all', { method: 'POST' }),
  deleteNotification: (id: string) => fetchApi(`/notifications/${id}`, { method: 'DELETE' }),

  // Odoo Parity Invoicing
  getPharmacyProfile: (branchId?: string) => {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return fetchApi(`/invoicing/profile${q}`);
  },
  updatePharmacyProfile: (data: any, branchId?: string) => {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return fetchApi(`/invoicing/profile${q}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  getInvoices: (params?: { status?: string; search?: string; customer_id?: string; source_type?: string }) => {
    const q = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') q.append('status', params.status);
    if (params?.search) q.append('search', params.search);
    if (params?.customer_id) q.append('customer_id', params.customer_id);
    if (params?.source_type && params.source_type !== 'ALL') q.append('source_type', params.source_type);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchApi(`/invoicing/invoices${qs}`);
  },
  getInvoice: (id: string) => fetchApi(`/invoicing/invoices/${id}`),
  createInvoice: (data: any) => fetchApi('/invoicing/invoices', { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: (id: string, data: any) => fetchApi(`/invoicing/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  confirmInvoice: (id: string) => fetchApi(`/invoicing/invoices/${id}/confirm`, { method: 'POST' }),
  payInvoice: (id: string, data: { payment_method: string; amount: number; payment_date?: string; reference?: string; notes?: string }) =>
    fetchApi(`/invoicing/invoices/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
  cancelInvoice: (id: string) => fetchApi(`/invoicing/invoices/${id}/cancel`, { method: 'POST' }),
  resetInvoiceToDraft: (id: string) => fetchApi(`/invoicing/invoices/${id}/reset-draft`, { method: 'POST' }),
  deleteInvoice: (id: string) => fetchApi(`/invoicing/invoices/${id}`, { method: 'DELETE' }),
  generateInvoiceFromPosSale: (saleId: string, customerId?: string) => {
    const q = customerId ? `?customer_id=${customerId}` : '';
    return fetchApi(`/invoicing/from-pos/${saleId}${q}`, { method: 'POST' });
  },

  // Procure-to-Stock & Purchases
  getPurchaseOrders: (params?: { branch_id?: string; supplier_id?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.branch_id) q.append('branch_id', params.branch_id);
    if (params?.supplier_id) q.append('supplier_id', params.supplier_id);
    if (params?.status && params.status !== 'ALL') q.append('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchApi<any[]>(`/purchases/orders${qs}`);
  },
  getPurchaseOrder: (id: string) => fetchApi<any>(`/purchases/orders/${id}`),
  createPurchaseOrder: (data: any) => fetchApi<any>('/purchases/orders', { method: 'POST', body: JSON.stringify(data) }),
  submitPurchaseOrder: (id: string) => fetchApi<any>(`/purchases/orders/${id}/submit`, { method: 'POST' }),
  approvePurchaseOrder: (id: string, notes?: string) =>
    fetchApi<any>(`/purchases/orders/${id}/approve`, { method: 'POST', body: JSON.stringify({ notes }) }),
  cancelPurchaseOrder: (id: string, reason: string) =>
    fetchApi<any>(`/purchases/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),

  getGoodsReceipts: (params?: { branch_id?: string; po_id?: string; supplier_id?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.branch_id) q.append('branch_id', params.branch_id);
    if (params?.po_id) q.append('po_id', params.po_id);
    if (params?.supplier_id) q.append('supplier_id', params.supplier_id);
    if (params?.status && params.status !== 'ALL') q.append('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchApi<any[]>(`/purchases/receipts${qs}`);
  },
  getGoodsReceipt: (id: string) => fetchApi<any>(`/purchases/receipts/${id}`),
  createGoodsReceipt: (data: any) => fetchApi<any>('/purchases/receipts', { method: 'POST', body: JSON.stringify(data) }),
  postGoodsReceipt: (id: string) => fetchApi<any>(`/purchases/receipts/${id}/post`, { method: 'POST' }),

  getSupplierReturns: (params?: { branch_id?: string; supplier_id?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.branch_id) q.append('branch_id', params.branch_id);
    if (params?.supplier_id) q.append('supplier_id', params.supplier_id);
    if (params?.status && params.status !== 'ALL') q.append('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchApi<any[]>(`/purchases/returns${qs}`);
  },
  getSupplierReturn: (id: string) => fetchApi<any>(`/purchases/returns/${id}`),
  createSupplierReturn: (data: any) => fetchApi<any>('/purchases/returns', { method: 'POST', body: JSON.stringify(data) }),
  postSupplierReturn: (id: string) => fetchApi<any>(`/purchases/returns/${id}/post`, { method: 'POST' }),

  getSupplierTerms: (params?: { supplier_id?: string; medicine_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.supplier_id) q.append('supplier_id', params.supplier_id);
    if (params?.medicine_id) q.append('medicine_id', params.medicine_id);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return fetchApi<any[]>(`/purchases/supplier-terms${qs}`);
  },
  createOrUpdateSupplierTerm: (data: any) => fetchApi<any>('/purchases/supplier-terms', { method: 'POST', body: JSON.stringify(data) }),

  getPurchaseAnalytics: (branchId?: string) => {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return fetchApi<any>(`/purchases/analytics${q}`);
  },
};
