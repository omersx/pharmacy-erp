'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Search, Plus, MoreVertical, Edit, Trash2, Eye, CreditCard, Ban, Users, UserPlus, FileText, DollarSign, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SlideOver } from '@/components/ui/slide-over';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatCard } from '@/components/ui/stat-card';
import { Switch } from '@/components/ui/switch';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAppStore } from '@/store/app-store';
import { api } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface Customer {
  id: string;
  name: string;
  arabic_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  credit_limit?: number;
  opening_balance?: number;
  balance?: number;
  status?: 'ACTIVE' | 'INACTIVE';
  is_active?: boolean;
  notes?: string;
  total_purchases?: number;
  created_at?: string;
}

const DEFAULT_FORM_DATA = {
  name: '',
  arabic_name: '',
  phone: '',
  email: '',
  address: '',
  credit_limit: 0,
  opening_balance: 0,
  notes: '',
  is_active: true,
};

export default function CustomersPage() {
  const { locale } = useParams();
  const { currency } = useAppStore();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setIsLoading(true);
      const data = await api.getCustomers();
      setCustomers((data as any[]) || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch customers');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setFormData(DEFAULT_FORM_DATA);
    setEditingId(null);
    setIsSlideOverOpen(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setFormData({
      name: customer.name,
      arabic_name: customer.arabic_name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      credit_limit: customer.credit_limit || 0,
      opening_balance: customer.opening_balance || 0,
      notes: customer.notes || '',
      is_active: customer.status === 'ACTIVE' || customer.is_active !== false,
    });
    setEditingId(customer.id);
    setIsSlideOverOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Name is required');
      return;
    }
    
    try {
      setIsSaving(true);
      const payload = {
        ...formData,
        status: formData.is_active ? 'ACTIVE' : 'INACTIVE',
        credit_limit: Number(formData.credit_limit),
        opening_balance: Number(formData.opening_balance)
      };
      
      if (editingId) {
        await api.updateCustomer(editingId, payload);
        toast.success('Customer updated successfully');
      } else {
        await api.createCustomer(payload);
        toast.success('Customer created successfully');
      }
      
      setIsSlideOverOpen(false);
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save customer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!customerToDelete) return;
    
    try {
      await api.deleteCustomer(customerToDelete);
      toast.success('Customer deleted successfully');
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete customer');
    } finally {
      setIsDeleteDialogOpen(false);
      setCustomerToDelete(null);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.updateCustomer(id, { status: newStatus });
      toast.success(`Customer ${newStatus.toLowerCase()}`);
      fetchCustomers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    }
  };
  
  const handleAddPayment = () => {
    toast.error('Payment module not implemented yet');
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (c.arabic_name && c.arabic_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            (c.phone && c.phone.includes(searchQuery));
      
      const isActive = c.status === 'ACTIVE' || c.is_active !== false;
      const hasBalance = (c.balance || 0) > 0;
      
      let matchesFilter = true;
      if (statusFilter === 'ACTIVE') matchesFilter = isActive;
      if (statusFilter === 'INACTIVE') matchesFilter = !isActive;
      if (statusFilter === 'HAS_BALANCE') matchesFilter = hasBalance;
      
      return matchesSearch && matchesFilter;
    });
  }, [customers, searchQuery, statusFilter]);

  const summary = useMemo(() => {
    const total = customers.length;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const newThisMonth = customers.filter(c => {
      if (!c.created_at) return false;
      const d = new Date(c.created_at);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;
    
    const creditCustomers = customers.filter(c => (c.balance || 0) > 0).length;
    const outstandingBalance = customers.reduce((acc, c) => acc + (c.balance || 0), 0);
    
    return { total, newThisMonth, creditCustomers, outstandingBalance };
  }, [customers]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(locale as string, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Customers</h1>
          <p className="text-sm text-gray-400 mt-1">Manage your customer database and credit accounts</p>
        </div>
        <Button variant="primary" onClick={handleOpenAdd} className="gap-2 w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Customers"
          value={summary.total.toString()}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="New This Month"
          value={summary.newThisMonth.toString()}
          icon={<UserPlus className="h-5 w-5" />}
        />
        <StatCard
          title="Credit Accounts"
          value={summary.creditCustomers.toString()}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          title="Outstanding Balance"
          value={formatCurrency(summary.outstandingBalance)}
          icon={<DollarSign className="h-5 w-5" />}
        />
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-[#0B1220] p-4 rounded-xl border border-gray-800 shadow-sm">
        <div className="flex flex-col sm:flex-row flex-1 w-full gap-4 items-center">
          <div className="w-full sm:max-w-sm relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search customers..."
              className="pl-10 bg-gray-900/50 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-[180px]">
            <Select
              options={[
                { value: 'ALL', label: 'All Customers' },
                { value: 'ACTIVE', label: 'Active Only' },
                { value: 'INACTIVE', label: 'Inactive Only' },
                { value: 'HAS_BALANCE', label: 'Has Balance' },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-[#0B1220] border border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-400 bg-gray-900/50 uppercase border-b border-gray-800 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium hidden md:table-cell">Contact</th>
                <th className="px-6 py-4 font-medium text-right hidden lg:table-cell">Total Purchases</th>
                <th className="px-6 py-4 font-medium text-right">Balance</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <Activity className="h-8 w-8 animate-pulse mb-2 text-brand-500" />
                      <p>Loading customers...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No customers found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const isActive = customer.status === 'ACTIVE' || customer.is_active !== false;
                  return (
                    <tr key={customer.id} className="hover:bg-gray-800/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-white">{customer.name}</span>
                          {customer.arabic_name && (
                            <span className="text-xs text-gray-400 mt-0.5">{customer.arabic_name}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div className="flex flex-col">
                          <span className="text-gray-300">{customer.phone || '-'}</span>
                          {customer.email && (
                            <span className="text-xs text-gray-500">{customer.email}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-gray-300 hidden lg:table-cell">
                        {customer.total_purchases !== undefined ? formatCurrency(customer.total_purchases) : formatCurrency(0)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn(
                          "font-medium",
                          (customer.balance || 0) > 0 ? "text-danger" : "text-gray-300"
                        )}>
                          {formatCurrency(customer.balance || 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant={isActive ? 'success' : 'default'}>
                          {isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content align="end" className="z-50 min-w-[160px] overflow-hidden rounded-lg border border-gray-800 bg-[#0B1220] p-1 shadow-xl animate-in data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2">
                              <DropdownMenu.Item asChild>
                                <Link 
                                  href={`/${locale}/customers/${customer.id}`}
                                  className="flex items-center gap-2 px-2 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-md cursor-pointer outline-none transition-colors"
                                >
                                  <Eye className="h-4 w-4" /> View Profile
                                </Link>
                              </DropdownMenu.Item>
                              <DropdownMenu.Item 
                                onClick={() => handleOpenEdit(customer)}
                                className="flex items-center gap-2 px-2 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-md cursor-pointer outline-none transition-colors"
                              >
                                <Edit className="h-4 w-4" /> Edit Details
                              </DropdownMenu.Item>
                              <DropdownMenu.Item asChild>
                                <Link 
                                  href={`/${locale}/sales?customerId=${customer.id}`}
                                  className="flex items-center gap-2 px-2 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-md cursor-pointer outline-none transition-colors"
                                >
                                  <Activity className="h-4 w-4" /> New Sale
                                </Link>
                              </DropdownMenu.Item>
                              <DropdownMenu.Item 
                                onClick={handleAddPayment}
                                className="flex items-center gap-2 px-2 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-md cursor-pointer outline-none transition-colors"
                              >
                                <CreditCard className="h-4 w-4" /> Add Payment
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="h-px bg-gray-800 my-1" />
                              {isActive ? (
                                <DropdownMenu.Item 
                                  onClick={() => handleStatusChange(customer.id, 'INACTIVE')}
                                  className="flex items-center gap-2 px-2 py-2 text-sm text-amber-400 hover:bg-gray-800 hover:text-amber-300 rounded-md cursor-pointer outline-none transition-colors"
                                >
                                  <Ban className="h-4 w-4" /> Deactivate
                                </DropdownMenu.Item>
                              ) : (
                                <DropdownMenu.Item 
                                  onClick={() => handleStatusChange(customer.id, 'ACTIVE')}
                                  className="flex items-center gap-2 px-2 py-2 text-sm text-success hover:bg-gray-800 rounded-md cursor-pointer outline-none transition-colors"
                                >
                                  <Activity className="h-4 w-4" /> Activate
                                </DropdownMenu.Item>
                              )}
                              <DropdownMenu.Item 
                                onClick={() => {
                                  setCustomerToDelete(customer.id);
                                  setIsDeleteDialogOpen(true);
                                }}
                                className="flex items-center gap-2 px-2 py-2 text-sm text-danger hover:bg-red-950/50 hover:text-red-400 rounded-md cursor-pointer outline-none transition-colors"
                              >
                                <Trash2 className="h-4 w-4" /> Delete
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit SlideOver */}
      <SlideOver
        open={isSlideOverOpen}
        onClose={() => setIsSlideOverOpen(false)}
        title={editingId ? 'Edit Customer' : 'Add New Customer'}
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Full Name <span className="text-danger">*</span></label>
            <Input 
              placeholder="e.g. Ahmed Ali" 
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Arabic Name</label>
            <Input 
              placeholder="أحمد علي" 
              dir="auto"
              value={formData.arabic_name}
              onChange={(e) => setFormData(prev => ({ ...prev, arabic_name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Phone</label>
              <Input 
                placeholder="+252 XXXXXXX" 
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Email</label>
              <Input 
                type="email"
                placeholder="email@example.com" 
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Address</label>
            <Input 
              placeholder="Street, District, City" 
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Credit Limit ({currency})</label>
              <Input 
                type="number"
                min="0"
                placeholder="0.00" 
                value={formData.credit_limit || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, credit_limit: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Opening Balance ({currency})</label>
              <Input 
                type="number"
                min="0"
                placeholder="0.00" 
                value={formData.opening_balance || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, opening_balance: Number(e.target.value) }))}
                disabled={!!editingId} // Usually shouldn't change after creation
              />
              {!!editingId && <p className="text-xs text-gray-500">Cannot edit after creation</p>}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Notes</label>
            <textarea
              className="flex min-h-[100px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Any additional information..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>
          
          <div className="pt-2">
            <div className="flex items-center justify-between border border-gray-800 p-4 rounded-lg bg-gray-900/30">
              <div className="space-y-0.5">
                <label className="text-sm font-medium text-white">Active Status</label>
                <p className="text-xs text-gray-400">Can this customer make new purchases?</p>
              </div>
              <Switch 
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t border-gray-800 mt-6">
            <Button variant="secondary" onClick={() => setIsSlideOverOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Customer'}
            </Button>
          </div>
        </div>
      </SlideOver>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onCancel={() => {
          setIsDeleteDialogOpen(false);
          setCustomerToDelete(null);
        }}
        onConfirm={handleDelete}
        title="Delete Customer"
        message="Are you sure you want to delete this customer? This action cannot be undone and will fail if the customer has existing transactions or outstanding balance."
        confirmText="Delete Customer"
      />
    </div>
  );
}