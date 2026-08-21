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
  
  // Inventory
  getStock: () => fetchApi('/inventory/stock'),
  getMedicineStock: (id: string) => fetchApi(`/inventory/stock/${id}`),
  createAdjustment: (data: any) => fetchApi('/inventory/adjustments', { method: 'POST', body: JSON.stringify(data) }),
  getMovements: () => fetchApi('/inventory/movements'),
  getMedicineMovements: (medicineId: string) => fetchApi(`/inventory/movements?medicine_id=${medicineId}`),
  // Inventory Alerts
  getLowStock: () => fetchApi('/inventory/alerts/low-stock'),
  getOutOfStock: () => fetchApi('/inventory/alerts/out-of-stock'),
  getExpiring: () => fetchApi('/inventory/alerts/expiring'),
  getExpired: () => fetchApi('/inventory/alerts/expired'),
  
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
  getSaleById: (id: string) => fetchApi(`/sales/${id}`),
  returnSale: (id: string) => fetchApi(`/sales/${id}/return`, { method: 'POST' }),
  
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
  updateCustomerNotes: (id: string, notes: string) => fetchApi(`/customers/${id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
  
  // Cash Sessions
  openSession: (data: any) => fetchApi('/cash-sessions/open', { method: 'POST', body: JSON.stringify(data) }),
  closeSession: (id: string, data: any) => fetchApi(`/cash-sessions/${id}/close`, { method: 'POST', body: JSON.stringify(data) }),
  getActiveSession: () => fetchApi('/cash-sessions/active'),
  getSessions: () => fetchApi('/cash-sessions'),
  
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
};
