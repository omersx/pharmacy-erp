'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { SlideOver } from '@/components/ui/slide-over';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'react-hot-toast';
import {
  Users, Shield, Building2, CreditCard, HardDrive, ScrollText,
  Settings, Info, Plus, Edit, Trash2, Search, ChevronRight,
  UserCheck, UserX, Mail, Phone, Key, Globe, Clock, Bell,
  Database, CheckCircle2, XCircle, Download, Upload, Calendar,
  Lock, Eye, EyeOff, AlertTriangle, RefreshCw, Zap, Heart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';

// ─── Tab Configuration ──────────────────────────────────────────────────
const TABS = [
  { id: 'users', label: 'Users', icon: Users, description: 'Manage user accounts and access' },
  { id: 'roles', label: 'Roles & Permissions', icon: Shield, description: 'Configure role-based access' },
  { id: 'branches', label: 'Branches', icon: Building2, description: 'Manage pharmacy branches' },
  { id: 'payment', label: 'Payment Methods', icon: CreditCard, description: 'Accepted payment methods' },
  { id: 'backup', label: 'Backup & Restore', icon: HardDrive, description: 'Database backup & recovery' },
  { id: 'audit', label: 'Audit Logs', icon: ScrollText, description: 'Activity & change history' },
  { id: 'system', label: 'System Settings', icon: Settings, description: 'General configuration' },
  { id: 'about', label: 'About', icon: Info, description: 'System information' },
] as const;

type TabId = typeof TABS[number]['id'];

// ─── Role Colors ────────────────────────────────────────────────────────
const ROLE_COLORS: Record<string, string> = {
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  green: 'bg-green-500/10 text-green-400 border-green-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  teal: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};

// ─── Default Role Definitions (fallback when API unavailable) ───────────
const DEFAULT_ROLES = [
  { name: 'SUPER_ADMIN', display_name: 'Super Admin', display_name_ar: 'المدير العام', description: 'Full system access. Can manage everything.', color: 'red', is_system: true, user_count: 1 },
  { name: 'OWNER', display_name: 'Owner', display_name_ar: 'المالك', description: 'Business owner with access to all features except system settings.', color: 'purple', is_system: true, user_count: 0 },
  { name: 'BRANCH_MANAGER', display_name: 'Branch Manager', display_name_ar: 'مدير الفرع', description: 'Manages branch operations, inventory, and staff.', color: 'blue', is_system: true, user_count: 0 },
  { name: 'PHARMACIST', display_name: 'Pharmacist', display_name_ar: 'صيدلي', description: 'Can process sales, view inventory, and manage prescriptions.', color: 'green', is_system: true, user_count: 0 },
  { name: 'CASHIER', display_name: 'Cashier', display_name_ar: 'كاشير', description: 'POS access for processing sales and returns.', color: 'amber', is_system: true, user_count: 0 },
  { name: 'INVENTORY_STAFF', display_name: 'Inventory Staff', display_name_ar: 'موظف المخزون', description: 'Manages inventory, receives stock, and handles adjustments.', color: 'teal', is_system: true, user_count: 0 },
  { name: 'ACCOUNTANT', display_name: 'Accountant', display_name_ar: 'محاسب', description: 'Access to financial reports, sales data, and purchases.', color: 'indigo', is_system: true, user_count: 0 },
];

// ─── Permission Module Definitions ──────────────────────────────────────
const PERMISSION_MODULES = [
  { module: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { module: 'pos', label: 'Point of Sale', actions: ['view', 'create_sale', 'void_sale', 'apply_discount', 'hold_sale'] },
  { module: 'sales', label: 'Sales', actions: ['view', 'create', 'void', 'return_sale', 'export'] },
  { module: 'inventory', label: 'Inventory', actions: ['view', 'adjust', 'transfer', 'receive'] },
  { module: 'catalog', label: 'Catalog', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'customers', label: 'Customers', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'reports', label: 'Reports', actions: ['view', 'export'] },
  { module: 'settings', label: 'Settings', actions: ['view', 'manage_users', 'manage_roles', 'manage_branches', 'manage_system'] },
  { module: 'purchases', label: 'Purchases', actions: ['view', 'create', 'approve', 'receive'] },
];



// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const { currency, setCurrency } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabId>('users');
  
  // ── Users State ──
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSlideOpen, setUserSlideOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ full_name: '', email: '', password: '', role: 'CASHIER', phone: '' });
  const [deleteUserDialog, setDeleteUserDialog] = useState({ open: false, id: '', name: '' });
  
  // ── Branches State ──
  const [branches, setBranches] = useState<any[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchSlideOpen, setBranchSlideOpen] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [branchForm, setBranchForm] = useState({ name: '', name_ar: '', code: '', address: '', phone: '', email: '', currency: 'SDG', timezone: 'Africa/Khartoum' });
  
  // ── Roles State ──
  const [roles, setRoles] = useState<any[]>(DEFAULT_ROLES);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  
  // ── Payment Methods State ──
  const [paymentMethods, setPaymentMethods] = useState([
    { id: 'cash', name: 'Cash', name_ar: 'نقدي', enabled: true, icon: '💵' },
    { id: 'card', name: 'Credit/Debit Card', name_ar: 'بطاقة ائتمان', enabled: true, icon: '💳' },
    { id: 'bank', name: 'Bank Transfer', name_ar: 'حوالة بنكية', enabled: false, icon: '🏦' },
    { id: 'insurance', name: 'Insurance', name_ar: 'تأمين', enabled: false, icon: '🏥' },
  ]);
  
  // ── System Settings State ──
  const [systemSettings, setSystemSettings] = useState({
    pharmacyName: 'Pharma ERP',
    licenseNumber: 'PH-2026-001',
    phone: '+249 12 345 6789',
    address: 'Khartoum, Sudan',
    currency: currency || 'SDG',
    timezone: 'Africa/Khartoum',
    dateFormat: 'DD/MM/YYYY',
    language: 'en',
    lowStockThreshold: 10,
    expiryWarningDays: 90,
    sessionTimeout: 120,
    enforceStrongPassword: true,
  });
  
  // ── General State ──
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Backup state
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const restoreInputRef = React.useRef<HTMLInputElement>(null);

  // Audit log state  
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPages, setAuditPages] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditModule, setAuditModule] = useState('all');
  const [auditAction, setAuditAction] = useState('all');
  // ── Danger Zone State ──
  const [wipeDataOpen, setWipeDataOpen] = useState(false);
  const [factoryResetOpen, setFactoryResetOpen] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleWipeData = async () => {
    try {
      setIsWiping(true);
      await api.wipeData();
      toast.success('All business data has been wiped.');
      setWipeDataOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to wipe data');
    } finally {
      setIsWiping(false);
    }
  };

  const handleFactoryReset = async () => {
    try {
      setIsResetting(true);
      await api.factoryReset();
      toast.success('Factory reset complete. Redirecting to login...');
      setTimeout(() => {
        window.location.href = '/en/login';
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || 'Failed to factory reset');
      setIsResetting(false);
    }
  };

  // Fetch backups
  const fetchBackups = async () => {
    setBackupsLoading(true);
    try {
      const data = await api.getBackups();
      setBackups(Array.isArray(data) ? data : []);
    } catch (e) {
      setBackups([]);
    } finally {
      setBackupsLoading(false);
    }
  };

  // Fetch audit logs
  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const data: any = await api.getAuditLogs({
        page: auditPage,
        per_page: 20,
        module: auditModule,
        action: auditAction,
        search: auditSearch || undefined
      });
      setAuditLogs(data.items || []);
      setAuditTotal(data.total || 0);
      setAuditPages(data.pages || 1);
    } catch (e) {
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  };

  // Handle backup creation
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      await api.createBackup();
      toast.success('Backup created successfully');
      fetchBackups();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  // Handle backup restore
  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.db')) {
      toast.error('Only .db files are accepted');
      return;
    }
    try {
      await api.restoreBackup(file);
      toast.success('Database restored! Please refresh the page.');
    } catch (err: any) {
      toast.error(err.message || 'Restore failed');
    }
    e.target.value = '';
  };

  // Handle backup delete
  const handleDeleteBackup = async (filename: string) => {
    try {
      await api.deleteBackup(filename);
      toast.success('Backup deleted');
      fetchBackups();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete backup');
    }
  };

  // ── Fetch Data ──
  useEffect(() => {
    fetchUsers();
    fetchBranches();
    fetchRoles();
  }, []);

  useEffect(() => {
    if (activeTab === 'backup') fetchBackups();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeTab, auditPage, auditModule, auditAction]);

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const data = await api.getUsers().catch(() => []);
      setUsers(Array.isArray(data) ? data : []);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      setBranchesLoading(true);
      const data = await api.getBranches().catch(() => []);
      setBranches(Array.isArray(data) ? data : []);
    } finally {
      setBranchesLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const data = await api.getRoles().catch(() => null);
      if (data && Array.isArray(data) && data.length > 0) {
        setRoles(data);
      }
    } catch {}
  };

  // ── User CRUD ──
  const openAddUser = () => {
    setEditingUserId(null);
    setUserForm({ full_name: '', email: '', password: '', role: 'CASHIER', phone: '' });
    setUserSlideOpen(true);
  };

  const openEditUser = (user: any) => {
    setEditingUserId(user.id);
    setUserForm({ full_name: user.full_name || '', email: user.email || '', password: '', role: user.role || 'CASHIER', phone: user.phone || '' });
    setUserSlideOpen(true);
  };

  const saveUser = async () => {
    if (!userForm.full_name || !userForm.email) {
      toast.error('Name and email are required');
      return;
    }
    try {
      setIsSaving(true);
      if (editingUserId) {
        const payload: any = { full_name: userForm.full_name, role: userForm.role, phone: userForm.phone };
        await api.updateUser(editingUserId, payload);
        toast.success('User updated');
      } else {
        if (!userForm.password) { toast.error('Password is required for new users'); setIsSaving(false); return; }
        await api.registerUser({ email: userForm.email, password: userForm.password, full_name: userForm.full_name, role: userForm.role, phone: userForm.phone });
        toast.success('User created');
      }
      setUserSlideOpen(false);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save user');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteUser = async () => {
    try {
      setIsSaving(true);
      await api.deleteUser(deleteUserDialog.id);
      toast.success('User deactivated');
      setDeleteUserDialog({ open: false, id: '', name: '' });
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete user');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Branch CRUD ──
  const openAddBranch = () => {
    setEditingBranchId(null);
    setBranchForm({ name: '', name_ar: '', code: '', address: '', phone: '', email: '', currency: 'SDG', timezone: 'Africa/Khartoum' });
    setBranchSlideOpen(true);
  };

  const openEditBranch = (branch: any) => {
    setEditingBranchId(branch.id);
    setBranchForm({
      name: branch.name || '', name_ar: branch.name_ar || '', code: branch.code || '',
      address: branch.address || '', phone: branch.phone || '', email: branch.email || '',
      currency: branch.currency || 'SDG', timezone: branch.timezone || 'Africa/Khartoum',
    });
    setBranchSlideOpen(true);
  };

  const saveBranch = async () => {
    if (!branchForm.name || !branchForm.code) {
      toast.error('Name and code are required');
      return;
    }
    try {
      setIsSaving(true);
      const payload: any = { ...branchForm };
      if (!payload.email) delete payload.email;
      if (!payload.phone) delete payload.phone;
      if (!payload.address) delete payload.address;
      
      if (editingBranchId) {
        await api.updateBranch(editingBranchId, payload);
        toast.success('Branch updated');
      } else {
        await api.createBranch(payload);
        toast.success('Branch created');
      }
      setBranchSlideOpen(false);
      fetchBranches();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save branch');
    } finally {
      setIsSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col gap-0 h-full min-h-[calc(100vh-120px)]">
      {/* Header */}
      <header className="flex-none rounded-t-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
            <Settings className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your pharmacy system configuration</p>
          </div>
        </div>
      </header>

      {/* Two-panel layout */}
      <div className="flex-1 flex flex-col md:flex-row rounded-b-xl border border-t-0 border-border bg-surface overflow-hidden shadow-sm">
        {/* Left Sidebar Nav */}
        <nav className="w-full md:w-64 flex-none border-b md:border-b-0 md:border-r border-border bg-background/50 p-3 overflow-x-auto md:overflow-y-auto scrollbar-hide">
          <div className="flex md:flex-col gap-1 space-y-0 md:space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex whitespace-nowrap flex-none w-auto md:w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-brand-500/10 text-brand-400 shadow-sm"
                      : "text-muted-foreground hover:bg-gray-100 hover:text-foreground dark:hover:bg-gray-800/60 dark:hover:text-gray-200"
                  )}
                >
                  <Icon className={cn("h-4 w-4 flex-none", isActive ? "text-brand-400" : "text-muted-foreground")} />
                  <span className="truncate">{tab.label}</span>
                  {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 text-brand-400" />}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Right Content Panel */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'users' && renderUsersTab()}
          {activeTab === 'roles' && renderRolesTab()}
          {activeTab === 'branches' && renderBranchesTab()}
          {activeTab === 'payment' && renderPaymentTab()}
          {activeTab === 'backup' && renderBackupTab()}
          {activeTab === 'audit' && renderAuditTab()}
          {activeTab === 'system' && renderSystemTab()}
          {activeTab === 'about' && renderAboutTab()}
        </main>
      </div>

      {/* Slide-overs & Dialogs */}
      {renderUserSlideOver()}
      {renderBranchSlideOver()}
      <ConfirmDialog
        open={deleteUserDialog.open}
        onCancel={() => setDeleteUserDialog({ open: false, id: '', name: '' })}
        onConfirm={deleteUser}
        title="Deactivate User"
        message={`Are you sure you want to deactivate ${deleteUserDialog.name}? They will no longer be able to log in.`}
        isLoading={isSaving}
      />
      <ConfirmDialog
        open={wipeDataOpen}
        onCancel={() => setWipeDataOpen(false)}
        onConfirm={handleWipeData}
        title="Wipe Business Data"
        message="Are you absolutely sure? This will permanently delete all catalog items, inventory batches, and sales records. This action cannot be undone."
        isLoading={isWiping}
      />
      <ConfirmDialog
        open={factoryResetOpen}
        onCancel={() => setFactoryResetOpen(false)}
        onConfirm={handleFactoryReset}
        title="Factory Reset"
        message="DANGER: This will erase the ENTIRE database, including all users, roles, and settings. The system will be restored to factory defaults. This action cannot be undone."
        isLoading={isResetting}
      />
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════
  // TAB: USERS
  // ═══════════════════════════════════════════════════════════════════
  function renderUsersTab() {
    const filteredUsers = users.filter(u =>
      searchQuery === '' ||
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">User Management</h2>
            <p className="text-sm text-muted-foreground">{users.length} users registered</p>
          </div>
          <button onClick={openAddUser} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 shadow-lg shadow-brand-500/20">
            <Plus className="h-4 w-4" /> Add User
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text" placeholder="Search users..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Users Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Last Login</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {usersLoading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-4 bg-gray-800 rounded w-3/4" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-gray-800 rounded w-1/2" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-gray-800 rounded w-1/3" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-gray-800 rounded w-1/2" /></td>
                    <td className="px-5 py-4"><div className="h-4 bg-gray-800 rounded w-8 ml-auto" /></td>
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Users className="h-10 w-10 mx-auto text-gray-600 mb-3" />
                    <p className="text-sm text-muted-foreground">No users found</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="group transition-colors hover:bg-gray-800/30">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/10 text-brand-400 font-semibold text-sm">
                          {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{user.full_name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={user.role === 'admin' || user.role === 'SUPER_ADMIN' ? 'info' : 'default'}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={user.is_active ? 'success' : 'danger'}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditUser(user)} className="p-1.5 text-muted-foreground hover:text-brand-400 hover:bg-brand-500/10 rounded-md transition-colors" title="Edit">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteUserDialog({ open: true, id: user.id, name: user.full_name })} className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors" title="Deactivate">
                          <UserX className="h-4 w-4" />
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
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB: ROLES & PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════
  function renderRolesTab() {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Roles & Permissions</h2>
          <p className="text-sm text-muted-foreground">Define access levels for each user role</p>
        </div>

        <div className="grid gap-4">
          {roles.map((role: any) => {
            const isExpanded = expandedRole === role.name;
            const colorClass = ROLE_COLORS[role.color || 'blue'] || ROLE_COLORS.blue;
            const userCount = users.filter(u => u.role === role.name || (role.name === 'SUPER_ADMIN' && u.role === 'admin')).length;

            return (
              <div key={role.name} className="rounded-xl border border-border bg-background/50 overflow-hidden transition-all duration-200">
                {/* Role Header */}
                <button
                  onClick={() => setExpandedRole(isExpanded ? null : role.name)}
                  className="flex w-full items-center gap-4 p-4 text-left hover:bg-gray-800/30 transition-colors"
                >
                  <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", colorClass)}>
                    <Shield className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{role.display_name}</h3>
                      {role.is_system && (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-gray-800 px-1.5 py-0.5 rounded">System</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{role.description}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-none">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{userCount}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Users</p>
                    </div>
                    <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-90")} />
                  </div>
                </button>

                {/* Expanded Permission Matrix */}
                {isExpanded && (
                  <div className="border-t border-border p-4 bg-background/30 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="grid gap-3">
                      {PERMISSION_MODULES.map(mod => (
                        <div key={mod.module} className="flex items-start gap-4 p-3 rounded-lg bg-gray-800/20">
                          <div className="w-28 flex-none">
                            <p className="text-sm font-medium text-foreground">{mod.label}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {mod.actions.map(action => {
                              const permCode = `${mod.module}.${action}`;
                              const hasPermission = role.name === 'SUPER_ADMIN' || 
                                (role.permissions && role.permissions.some((p: any) => p.code === permCode));
                              return (
                                <span
                                  key={action}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors",
                                    hasPermission
                                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                                      : "bg-gray-800/50 text-gray-500 border-gray-700/50"
                                  )}
                                >
                                  {hasPermission ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                  {action.replace('_', ' ')}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB: BRANCHES
  // ═══════════════════════════════════════════════════════════════════
  function renderBranchesTab() {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Branch Management</h2>
            <p className="text-sm text-muted-foreground">{branches.length} branches configured</p>
          </div>
          <button onClick={openAddBranch} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 shadow-lg shadow-brand-500/20">
            <Plus className="h-4 w-4" /> Add Branch
          </button>
        </div>

        <div className="grid gap-4">
          {branchesLoading ? (
            [...Array(2)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-background/50 p-5 animate-pulse">
                <div className="h-5 bg-gray-800 rounded w-1/3 mb-3" />
                <div className="h-4 bg-gray-800 rounded w-1/2" />
              </div>
            ))
          ) : branches.length === 0 ? (
            <div className="rounded-xl border border-border bg-background/50 p-12 text-center">
              <Building2 className="h-10 w-10 mx-auto text-gray-600 mb-3" />
              <p className="text-sm text-muted-foreground">No branches configured</p>
              <button onClick={openAddBranch} className="mt-4 text-brand-400 hover:text-brand-300 font-medium text-sm">
                <Plus className="h-4 w-4 inline mr-1" /> Add your first branch
              </button>
            </div>
          ) : (
            branches.map(branch => (
              <div key={branch.id} className="group rounded-xl border border-border bg-background/50 p-5 hover:border-brand-500/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{branch.name}</h3>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Key className="h-3 w-3" /> {branch.code}</span>
                        {branch.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {branch.phone}</span>}
                        {branch.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {branch.email}</span>}
                        <span className="flex items-center gap-1"><Globe className="h-3 w-3" /> {branch.currency || 'SDG'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Badge variant={branch.is_active !== false ? 'success' : 'danger'}>
                      {branch.is_active !== false ? 'Active' : 'Inactive'}
                    </Badge>
                    <button onClick={() => openEditBranch(branch)} className="p-1.5 text-muted-foreground hover:text-brand-400 hover:bg-brand-500/10 rounded-md transition-colors">
                      <Edit className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB: PAYMENT METHODS
  // ═══════════════════════════════════════════════════════════════════
  function renderPaymentTab() {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Payment Methods</h2>
          <p className="text-sm text-muted-foreground">Configure which payment methods are accepted at POS</p>
        </div>
        <div className="grid gap-4">
          {paymentMethods.map(method => (
            <div key={method.id} className={cn(
              "rounded-xl border p-5 transition-all duration-200",
              method.enabled
                ? "border-brand-500/30 bg-brand-500/5"
                : "border-border bg-background/50 opacity-60"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{method.icon}</span>
                  <div>
                    <h3 className="font-semibold text-foreground">{method.name}</h3>
                    <p className="text-xs text-muted-foreground">{method.name_ar}</p>
                  </div>
                </div>
                <Switch
                  checked={method.enabled}
                  onCheckedChange={checked => {
                    setPaymentMethods(prev => prev.map(m => m.id === method.id ? { ...m, enabled: checked } : m));
                    toast.success(`${method.name} ${checked ? 'enabled' : 'disabled'}`);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          Payment method changes will take effect on the next POS session.
        </p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB: BACKUP & RESTORE
  // ═══════════════════════════════════════════════════════════════════
  function renderBackupTab() {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Backup & Restore</h2>
          <p className="text-sm text-muted-foreground">Manage database backups and restore points</p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handleCreateBackup}
            disabled={creatingBackup}
            className="flex items-center gap-4 rounded-xl border border-border bg-background/50 p-5 hover:border-brand-500/30 hover:bg-brand-500/5 transition-all group disabled:opacity-50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400 group-hover:bg-brand-500/20 transition-colors">
              {creatingBackup ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-foreground">{creatingBackup ? 'Creating...' : 'Create Backup'}</h3>
              <p className="text-xs text-muted-foreground">Export database snapshot now</p>
            </div>
          </button>
          <button
            onClick={() => restoreInputRef.current?.click()}
            className="flex items-center gap-4 rounded-xl border border-border bg-background/50 p-5 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all group"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
              <Upload className="h-5 w-5" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-foreground">Restore Backup</h3>
              <p className="text-xs text-muted-foreground">Restore from a backup file</p>
            </div>
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".db"
            onChange={handleRestoreBackup}
            className="hidden"
          />
        </div>

        {/* Backup History */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Backup History</h3>
          {backupsLoading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Loading backups...</div>
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-border">
              <HardDrive className="h-10 w-10 text-foreground/20 mb-3" />
              <h3 className="text-sm font-semibold text-foreground">No backups yet</h3>
              <p className="text-xs text-foreground/50 mt-1">Create your first backup using the button above</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Filename</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Size</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {backups.map((b: any) => (
                    <tr key={b.filename} className="hover:bg-surface/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-brand-400" />
                          {b.filename}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(b.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{b.size_display}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => api.downloadBackup(b.filename)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500/10 text-brand-400 px-2.5 py-1.5 text-xs font-medium hover:bg-brand-500/20 transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(b.filename)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 text-red-400 px-2.5 py-1.5 text-xs font-medium hover:bg-red-500/20 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB: AUDIT LOGS
  // ═══════════════════════════════════════════════════════════════════
  function renderAuditTab() {
    const ACTION_COLORS: Record<string, string> = {
      CREATE: 'bg-green-500/10 text-green-400',
      UPDATE: 'bg-blue-500/10 text-blue-400',
      DELETE: 'bg-red-500/10 text-red-400',
      LOGIN: 'bg-purple-500/10 text-purple-400',
      LOGOUT: 'bg-gray-500/10 text-gray-400',
      IMPORT: 'bg-amber-500/10 text-amber-400',
      WIPE: 'bg-red-500/10 text-red-400',
      BACKUP: 'bg-teal-500/10 text-teal-400',
      RESTORE: 'bg-orange-500/10 text-orange-400',
      RESET: 'bg-red-500/10 text-red-400',
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Audit Logs</h2>
          <p className="text-sm text-muted-foreground">Track all system activities and changes</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search logs..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setAuditPage(1); fetchAuditLogs(); } }}
              className="h-9 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <Select
            value={auditModule}
            onChange={(v) => { setAuditModule(v); setAuditPage(1); }}
            options={[
              { value: 'all', label: 'All Modules' },
              { value: 'Auth', label: 'Auth' },
              { value: 'Sales', label: 'Sales' },
              { value: 'Inventory', label: 'Inventory' },
              { value: 'Medicine', label: 'Medicine' },
              { value: 'Customer', label: 'Customer' },
              { value: 'Admin', label: 'Admin' },
            ]}
            className="w-[160px]"
          />
          <Select
            value={auditAction}
            onChange={(v) => { setAuditAction(v); setAuditPage(1); }}
            options={[
              { value: 'all', label: 'All Actions' },
              { value: 'CREATE', label: 'Create' },
              { value: 'UPDATE', label: 'Update' },
              { value: 'DELETE', label: 'Delete' },
              { value: 'LOGIN', label: 'Login' },
              { value: 'IMPORT', label: 'Import' },
              { value: 'BACKUP', label: 'Backup' },
              { value: 'WIPE', label: 'Wipe' },
            ]}
            className="w-[160px]"
          />
          <button
            onClick={() => { setAuditPage(1); fetchAuditLogs(); }}
            className="h-9 px-3 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Logs Table */}
        {auditLoading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Loading audit logs...</div>
        ) : auditLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-border">
            <ScrollText className="h-10 w-10 text-foreground/20 mb-3" />
            <h3 className="text-sm font-semibold text-foreground">No audit logs found</h3>
            <p className="text-xs text-foreground/50 mt-1">Activity will be logged as users interact with the system</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Timestamp</th>
                    <th className="px-4 py-3 text-left font-semibold">User</th>
                    <th className="px-4 py-3 text-left font-semibold">Action</th>
                    <th className="px-4 py-3 text-left font-semibold">Module</th>
                    <th className="px-4 py-3 text-left font-semibold">Details</th>
                    <th className="px-4 py-3 text-left font-semibold">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-surface/50 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{log.user_email || 'System'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-500/10 text-gray-400'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{log.module}</td>
                      <td className="px-4 py-3 text-foreground max-w-xs truncate" title={log.details}>{log.details}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{log.ip_address || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Showing page {auditPage} of {auditPages} ({auditTotal} total logs)</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                  disabled={auditPage <= 1}
                  className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setAuditPage(p => Math.min(auditPages, p + 1))}
                  disabled={auditPage >= auditPages}
                  className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB: SYSTEM SETTINGS
  // ═══════════════════════════════════════════════════════════════════
  function renderSystemTab() {
    const InputField = ({ label, value, field, type = 'text' }: { label: string; value: string | number; field: string; type?: string }) => (
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">{label}</label>
        <input
          type={type} value={value}
          onChange={e => setSystemSettings(prev => ({ ...prev, [field]: type === 'number' ? Number(e.target.value) : e.target.value }))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
    );

    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">System Settings</h2>
            <p className="text-sm text-muted-foreground">Configure your pharmacy system preferences</p>
          </div>
          <button onClick={() => {
            setCurrency(systemSettings.currency);
            toast.success('Settings saved');
          }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600">
            Save Changes
          </button>
        </div>

        {/* Pharmacy Info */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Building2 className="h-4 w-4" /> Pharmacy Information
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Pharmacy Name" value={systemSettings.pharmacyName} field="pharmacyName" />
              <InputField label="License Number" value={systemSettings.licenseNumber} field="licenseNumber" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Phone" value={systemSettings.phone} field="phone" />
              <InputField label="Address" value={systemSettings.address} field="address" />
            </div>
          </div>
        </section>

        {/* Regional */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Globe className="h-4 w-4" /> Regional Settings
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Currency</label>
                <input list="system-currency-options" type="text" value={systemSettings.currency} onChange={e => setSystemSettings(prev => ({ ...prev, currency: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" placeholder="e.g. SDG" />
                <datalist id="system-currency-options">
                  <option value="SDG">SDG - Sudanese Pound</option>
                  <option value="SAR">SAR - Saudi Riyal</option>
                  <option value="AED">AED - Emirati Dirham</option>
                  <option value="KWD">KWD - Kuwaiti Dinar</option>
                  <option value="BHD">BHD - Bahraini Dinar</option>
                  <option value="QAR">QAR - Qatari Riyal</option>
                  <option value="OMR">OMR - Omani Rial</option>
                  <option value="USD">USD - US Dollar</option>
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Timezone</label>
                <input list="system-timezone-options" type="text" value={systemSettings.timezone} onChange={e => setSystemSettings(prev => ({ ...prev, timezone: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" placeholder="e.g. Africa/Khartoum" />
                <datalist id="system-timezone-options">
                  <option value="Africa/Khartoum">Africa/Khartoum (UTC+2)</option>
                  <option value="Asia/Riyadh">Asia/Riyadh (UTC+3)</option>
                  <option value="Asia/Dubai">Asia/Dubai (UTC+4)</option>
                  <option value="Asia/Kuwait">Asia/Kuwait (UTC+3)</option>
                  <option value="Asia/Bahrain">Asia/Bahrain (UTC+3)</option>
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Date Format</label>
                <Select value={systemSettings.dateFormat} onChange={v => setSystemSettings(prev => ({ ...prev, dateFormat: v }))} options={[
                  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                ]} />
              </div>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Bell className="h-4 w-4" /> Notification Thresholds
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Low Stock Alert Threshold (units)" value={systemSettings.lowStockThreshold} field="lowStockThreshold" type="number" />
              <InputField label="Expiry Warning (days before)" value={systemSettings.expiryWarningDays} field="expiryWarningDays" type="number" />
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Lock className="h-4 w-4" /> Security
          </div>
          <div className="rounded-xl border border-border bg-background/50 p-5 space-y-4">
            <InputField label="Session Timeout (minutes)" value={systemSettings.sessionTimeout} field="sessionTimeout" type="number" />
            <Switch
              checked={systemSettings.enforceStrongPassword}
              onCheckedChange={c => setSystemSettings(prev => ({ ...prev, enforceStrongPassword: c }))}
              label="Enforce Strong Passwords"
              description="Require minimum 8 characters with uppercase, lowercase, numbers, and symbols."
            />
          </div>
        </section>

        {/* Danger Zone */}
        <section className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-red-500">
            <AlertTriangle className="h-4 w-4" /> Danger Zone
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-foreground">Wipe Business Data</h4>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  Permanently delete all catalog items, inventory batches, and sales records. Keeps user accounts, branches, and system settings intact.
                </p>
              </div>
              <button 
                onClick={() => setWipeDataOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-500/10 px-4 text-sm font-medium text-red-600 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Wipe Data
              </button>
            </div>
            
            <div className="h-px bg-red-500/10 my-4" />
            
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-foreground">Factory Reset</h4>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  Erase EVERYTHING including user accounts, roles, and settings. Restores the system to a completely fresh state and logs you out.
                </p>
              </div>
              <button 
                onClick={() => setFactoryResetOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                <AlertTriangle className="h-4 w-4" />
                Factory Reset
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB: ABOUT
  // ═══════════════════════════════════════════════════════════════════
  function renderAboutTab() {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">About</h2>
          <p className="text-sm text-muted-foreground">System information and version details</p>
        </div>

        {/* App Info Card */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-brand-500/5 to-purple-500/5 p-8">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white dark:bg-background border border-border overflow-visible">
              <img src="/logo.png" alt="Pharma ERP Logo" className="w-20 h-20 object-contain scale-[1.5]" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-foreground">Pharma ERP</h3>
              <p className="text-sm text-muted-foreground mt-1">Complete pharmacy management solution</p>
              <div className="flex items-center gap-3 mt-2">
                <Badge variant="info">v1.0.0</Badge>
                <span className="text-xs text-muted-foreground">Build: August 2026</span>
              </div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-background/50 p-5">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">System Status</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2"><Database className="h-4 w-4" /> Database</span>
                <span className="text-sm text-green-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Connected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2"><Zap className="h-4 w-4" /> API Server</span>
                <span className="text-sm text-green-400 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Running</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Uptime</span>
                <span className="text-sm text-foreground">Active</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background/50 p-5">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Technology Stack</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Frontend</span>
                <span className="text-sm text-foreground">Next.js 15 + React 19</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Backend</span>
                <span className="text-sm text-foreground">FastAPI + Python</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Database</span>
                <span className="text-sm text-foreground">SQLite (aiosqlite)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Auth</span>
                <span className="text-sm text-foreground">JWT + Argon2</span>
              </div>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="rounded-xl border border-border bg-background/50 p-5">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Support & License</h4>
          <p className="text-sm text-muted-foreground">
            This system is built for the Gulf/MENA region pharmacy market. For support, contact your system administrator.
          </p>
          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
            <Heart className="h-3.5 w-3.5 text-red-400" />
            Built with care for modern pharmacy management
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // SLIDE-OVER: USER FORM
  // ═══════════════════════════════════════════════════════════════════
  function renderUserSlideOver() {
    return (
      <SlideOver
        open={userSlideOpen}
        onClose={() => setUserSlideOpen(false)}
        title={editingUserId ? 'Edit User' : 'Add New User'}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setUserSlideOpen(false)} className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors">Cancel</button>
            <button onClick={saveUser} disabled={isSaving} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
              {isSaving ? 'Saving...' : editingUserId ? 'Update User' : 'Create User'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Full Name *</label>
            <input type="text" value={userForm.full_name} onChange={e => setUserForm(p => ({ ...p, full_name: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Email *</label>
            <input type="email" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} disabled={!!editingUserId} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50" />
          </div>
          {!editingUserId && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Password *</label>
              <input type="password" value={userForm.password} onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Role</label>
            <Select
              value={userForm.role}
              onChange={v => setUserForm(p => ({ ...p, role: v }))}
              options={[
                { value: 'SUPER_ADMIN', label: 'Super Admin' },
                { value: 'OWNER', label: 'Owner' },
                { value: 'BRANCH_MANAGER', label: 'Branch Manager' },
                { value: 'PHARMACIST', label: 'Pharmacist' },
                { value: 'CASHIER', label: 'Cashier' },
                { value: 'INVENTORY_STAFF', label: 'Inventory Staff' },
                { value: 'ACCOUNTANT', label: 'Accountant' },
              ]}
              placeholder="Select role..."
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Phone</label>
            <input type="text" value={userForm.phone} onChange={e => setUserForm(p => ({ ...p, phone: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
        </div>
      </SlideOver>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // SLIDE-OVER: BRANCH FORM
  // ═══════════════════════════════════════════════════════════════════
  function renderBranchSlideOver() {
    return (
      <SlideOver
        open={branchSlideOpen}
        onClose={() => setBranchSlideOpen(false)}
        title={editingBranchId ? 'Edit Branch' : 'Add New Branch'}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setBranchSlideOpen(false)} className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground transition-colors">Cancel</button>
            <button onClick={saveBranch} disabled={isSaving} className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
              {isSaving ? 'Saving...' : editingBranchId ? 'Update Branch' : 'Create Branch'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Branch Name *</label>
              <input type="text" value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Arabic Name</label>
              <input type="text" value={branchForm.name_ar} onChange={e => setBranchForm(p => ({ ...p, name_ar: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" dir="rtl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Branch Code *</label>
            <input type="text" value={branchForm.code} onChange={e => setBranchForm(p => ({ ...p, code: e.target.value }))} disabled={!!editingBranchId} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50" placeholder="e.g. B001" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Phone</label>
              <input type="text" value={branchForm.phone} onChange={e => setBranchForm(p => ({ ...p, phone: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Email</label>
              <input type="text" value={branchForm.email} onChange={e => setBranchForm(p => ({ ...p, email: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Address</label>
            <input type="text" value={branchForm.address} onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Currency</label>
              <input list="currency-options" type="text" value={branchForm.currency} onChange={e => setBranchForm(p => ({ ...p, currency: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" placeholder="e.g. SDG" />
              <datalist id="currency-options">
                <option value="SDG" />
                <option value="SAR" />
                <option value="AED" />
                <option value="KWD" />
                <option value="QAR" />
                <option value="USD" />
              </datalist>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Timezone</label>
              <input list="timezone-options" type="text" value={branchForm.timezone} onChange={e => setBranchForm(p => ({ ...p, timezone: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" placeholder="e.g. Africa/Khartoum" />
              <datalist id="timezone-options">
                <option value="Africa/Khartoum" />
                <option value="Asia/Riyadh" />
                <option value="Asia/Dubai" />
              </datalist>
            </div>
          </div>
        </div>
      </SlideOver>
    );
  }
}
