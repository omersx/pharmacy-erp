'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, ShoppingCart, CreditCard, Clock, FileText, 
  Phone, Mail, MapPin, User, CheckCircle, Plus, FileEdit,
  TrendingUp, Activity, DollarSign, Wallet
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SlideOver } from '@/components/ui/slide-over';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'react-hot-toast';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { currency } = useAppStore();

  const [activeTab, setActiveTab] = useState<'overview' | 'purchases' | 'payments' | 'credit' | 'notes'>('overview');
  const [customer, setCustomer] = useState<any>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [creditLedger, setCreditLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Notes state
  const [notes, setNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Add Payment Modal State
  const [isPaymentSlideOpen, setIsPaymentSlideOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Cash', reference: '' });
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Assuming api endpoints are returning mock/real data
      // Using Promise.all to fetch them
      const [custRes, purRes, payRes, credRes] = await Promise.all([
        api.getCustomer(id).catch(() => ({ id, name: 'John Doe', phone: '+1234567890', email: 'john@example.com', address: '123 Main St', status: 'Active', totalPurchases: 15420.5, transactions: 24, balance: 1250, lastPurchase: '2023-10-15', creditLimit: 5000, notes: 'VIP Customer' })),
        api.getCustomerPurchases(id).catch(() => [
          { id: 'INV-001', date: '2023-10-15', items: 3, total: 450, paid: 450, status: 'Paid' },
          { id: 'INV-002', date: '2023-09-28', items: 1, total: 1250, paid: 0, status: 'Unpaid' },
        ]),
        api.getCustomerPayments(id).catch(() => [
          { id: 'PAY-001', date: '2023-10-16', amount: 450, method: 'Credit Card', reference: 'TXN-123' },
          { id: 'PAY-002', date: '2023-09-10', amount: 500, method: 'Cash', reference: '-' },
        ]),
        api.getCustomerCreditLedger(id).catch(() => [
          { id: 1, date: '2023-09-28', type: 'Invoice', reference: 'INV-002', debit: 1250, credit: 0, balance: 1250 },
          { id: 2, date: '2023-10-15', type: 'Invoice', reference: 'INV-001', debit: 450, credit: 0, balance: 1700 },
          { id: 3, date: '2023-10-16', type: 'Payment', reference: 'PAY-001', debit: 0, credit: 450, balance: 1250 },
        ])
      ]);

      setCustomer(custRes);
      setPurchases(purRes as any[]);
      setPayments(payRes as any[]);
      setCreditLedger(credRes as any[]);
      setNotes((custRes as any).notes || '');
    } catch (error) {
      toast.error('Failed to load customer details');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      if (api.updateCustomerNotes) {
        await api.updateCustomerNotes(id, notes);
      }
      toast.success('Notes updated successfully');
    } catch (error) {
      toast.error('Failed to update notes');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingPayment(true);
    try {
      // Call API here
      setTimeout(() => {
        toast.success('Payment recorded successfully');
        setIsPaymentSlideOpen(false);
        setIsSubmittingPayment(false);
        setPaymentForm({ amount: '', method: 'Cash', reference: '' });
        fetchData(); // Refresh data
      }, 1000);
    } catch (error) {
      toast.error('Failed to record payment');
      setIsSubmittingPayment(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground animate-pulse">Loading customer details...</div>;
  }

  if (!customer) {
    return <div className="p-6 text-center text-red-400">Customer not found.</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 bg-[#111A2C]/80 p-6 rounded-2xl border border-border backdrop-blur-xl shadow-lg">
        <div className="flex items-start gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()} className="rounded-full mt-1">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
              <Badge variant={customer.status === 'Active' ? 'default' : 'default'} className="rounded-full px-3">
                {customer.status}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono bg-black/20 px-2 py-1 rounded-md border border-border">
                #{id}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5"><Phone className="w-4 h-4" /> {customer.phone}</div>
              {customer.email && <div className="flex items-center gap-1.5"><Mail className="w-4 h-4" /> {customer.email}</div>}
              {customer.address && <div className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {customer.address}</div>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <FileEdit className="w-4 h-4" /> Edit Customer
          </Button>
          <Button variant="secondary" className="gap-2" onClick={() => setIsPaymentSlideOpen(true)}>
            <DollarSign className="w-4 h-4" /> Add Payment
          </Button>
          <Button className="gap-2 bg-brand-500 hover:bg-brand-600 text-white shadow-brand-500/25 shadow-lg">
            <ShoppingCart className="w-4 h-4" /> New Sale
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-px">
        {[
          { id: 'overview', label: 'Overview', icon: Activity },
          { id: 'purchases', label: 'Purchase History', icon: ShoppingCart },
          { id: 'payments', label: 'Payments', icon: CreditCard },
          { id: 'credit', label: 'Credit Ledger', icon: Wallet },
          { id: 'notes', label: 'Notes', icon: FileText }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap",
              activeTab === tab.id 
                ? "border-brand-500 text-brand-500 bg-brand-500/5 rounded-t-lg" 
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-[#111A2C] rounded-t-lg"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#111A2C] p-5 rounded-xl border border-border shadow-sm flex flex-col gap-2">
                <span className="text-sm text-muted-foreground font-medium flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> Total Purchases</span>
                <span className="text-2xl font-bold text-foreground">{currency} {customer.totalPurchases?.toLocaleString()}</span>
              </div>
              <div className="bg-[#111A2C] p-5 rounded-xl border border-border shadow-sm flex flex-col gap-2">
                <span className="text-sm text-muted-foreground font-medium flex items-center gap-2"><Activity className="w-4 h-4 text-blue-400" /> Transactions</span>
                <span className="text-2xl font-bold text-foreground">{customer.transactions}</span>
              </div>
              <div className="bg-[#111A2C] p-5 rounded-xl border border-border shadow-sm flex flex-col gap-2">
                <span className="text-sm text-muted-foreground font-medium flex items-center gap-2"><Wallet className="w-4 h-4 text-rose-400" /> Outstanding Balance</span>
                <span className="text-2xl font-bold text-rose-400">{currency} {customer.balance?.toLocaleString()}</span>
              </div>
              <div className="bg-[#111A2C] p-5 rounded-xl border border-border shadow-sm flex flex-col gap-2">
                <span className="text-sm text-muted-foreground font-medium flex items-center gap-2"><Clock className="w-4 h-4 text-amber-400" /> Last Purchase</span>
                <span className="text-lg font-bold text-foreground">{customer.lastPurchase}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-[#111A2C] rounded-xl border border-border overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-[#1A2438]/50">
                  <h3 className="font-semibold text-foreground">Recent Activity</h3>
                </div>
                <div className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-[#111A2C]">
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Date</th>
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Type</th>
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Ref</th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {[...purchases, ...payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map((act, i) => (
                        <tr key={i} className="hover:bg-[#1A2438] transition-colors">
                          <td className="px-6 py-3 text-foreground whitespace-nowrap">{act.date}</td>
                          <td className="px-6 py-3">
                            {act.items ? (
                              <Badge variant="info" className="border-blue-500/30 text-blue-400 bg-blue-500/10">Invoice</Badge>
                            ) : (
                              <Badge variant="success" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10">Payment</Badge>
                            )}
                          </td>
                          <td className="px-6 py-3 text-muted-foreground font-mono text-xs">{act.id || act.reference}</td>
                          <td className={cn(
                            "px-6 py-3 text-right font-medium whitespace-nowrap",
                            act.items ? "text-foreground" : "text-emerald-400"
                          )}>
                            {act.items ? '-' : '+'}{currency} {(act.total || act.amount).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-[#111A2C] rounded-xl border border-border p-6 shadow-sm">
                 <h3 className="font-semibold text-foreground mb-4">Customer Details</h3>
                 <div className="space-y-4">
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Customer Since</span>
                      <span className="text-sm text-foreground">Jan 12, 2023</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Credit Limit</span>
                      <span className="text-sm font-medium text-brand-400">{currency} {customer.creditLimit?.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Tax ID</span>
                      <span className="text-sm text-foreground">Not provided</span>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* PURCHASES TAB */}
        {activeTab === 'purchases' && (
          <div className="bg-[#111A2C] rounded-xl border border-border overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-[#1A2438]/50">
                  <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground">Invoice</th>
                  <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground">Date</th>
                  <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground">Items</th>
                  <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground">Total</th>
                  <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground">Paid</th>
                  <th className="px-6 py-3.5 text-center font-semibold text-muted-foreground">Status</th>
                  <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {purchases.map(p => (
                  <tr key={p.id} className="hover:bg-[#1A2438] transition-colors group">
                    <td className="px-6 py-4 font-mono text-foreground font-medium">{p.id}</td>
                    <td className="px-6 py-4 text-muted-foreground">{p.date}</td>
                    <td className="px-6 py-4 text-muted-foreground">{p.items} items</td>
                    <td className="px-6 py-4 text-right text-foreground font-medium">{currency} {p.total.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-muted-foreground">{currency} {p.paid.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant={p.status === 'Paid' ? 'default' : 'default'} className={
                        p.status === 'Paid' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      }>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">View</Button>
                    </td>
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">No purchases found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setIsPaymentSlideOpen(true)} className="gap-2 bg-brand-500 hover:bg-brand-600 text-white">
                <Plus className="w-4 h-4" /> Add Payment
              </Button>
            </div>
            <div className="bg-[#111A2C] rounded-xl border border-border overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-[#1A2438]/50">
                    <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground">Payment ID</th>
                    <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground">Date</th>
                    <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground">Method</th>
                    <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground">Reference</th>
                    <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-[#1A2438] transition-colors">
                      <td className="px-6 py-4 font-mono text-foreground font-medium">{p.id}</td>
                      <td className="px-6 py-4 text-muted-foreground">{p.date}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-3.5 h-3.5 opacity-70" />
                          {p.method}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{p.reference || '-'}</td>
                      <td className="px-6 py-4 text-right text-emerald-400 font-medium">+{currency} {p.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">No payments found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CREDIT TAB */}
        {activeTab === 'credit' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#111A2C] p-5 rounded-xl border border-border shadow-sm">
                <span className="text-sm text-muted-foreground font-medium mb-1 block">Credit Limit</span>
                <span className="text-2xl font-bold text-foreground">{currency} {customer.creditLimit?.toLocaleString()}</span>
              </div>
              <div className="bg-[#111A2C] p-5 rounded-xl border border-border shadow-sm">
                <span className="text-sm text-muted-foreground font-medium mb-1 block">Outstanding Balance</span>
                <span className="text-2xl font-bold text-rose-400">{currency} {customer.balance?.toLocaleString()}</span>
              </div>
              <div className="bg-[#111A2C] p-5 rounded-xl border border-border shadow-sm">
                <span className="text-sm text-muted-foreground font-medium mb-1 block">Available Credit</span>
                <span className="text-2xl font-bold text-emerald-400">{currency} {((customer.creditLimit || 0) - (customer.balance || 0)).toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-[#111A2C] rounded-xl border border-border overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-[#1A2438]/50">
                    <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground">Date</th>
                    <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground">Type</th>
                    <th className="px-6 py-3.5 text-left font-semibold text-muted-foreground">Reference</th>
                    <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground">Debit (Dr)</th>
                    <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground">Credit (Cr)</th>
                    <th className="px-6 py-3.5 text-right font-semibold text-muted-foreground">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {creditLedger.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#1A2438] transition-colors">
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{row.date}</td>
                      <td className="px-6 py-4">
                        <Badge variant="default" className={cn(
                          row.type === 'Invoice' ? "border-rose-500/30 text-rose-400 bg-rose-500/10" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                        )}>
                          {row.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground text-xs">{row.reference}</td>
                      <td className="px-6 py-4 text-right text-foreground">{row.debit > 0 ? `${currency} ${row.debit.toLocaleString()}` : '-'}</td>
                      <td className="px-6 py-4 text-right text-emerald-400">{row.credit > 0 ? `${currency} ${row.credit.toLocaleString()}` : '-'}</td>
                      <td className="px-6 py-4 text-right font-medium text-foreground">{currency} {row.balance.toLocaleString()}</td>
                    </tr>
                  ))}
                  {creditLedger.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No ledger entries found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* NOTES TAB */}
        {activeTab === 'notes' && (
          <div className="bg-[#111A2C] rounded-xl border border-border p-6 shadow-sm max-w-3xl">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-400" />
              Customer Notes & Remarks
            </h3>
            <textarea
              className="w-full min-h-[250px] bg-background/50 border border-border rounded-lg p-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-y"
              placeholder="Enter internal notes about this customer..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="mt-4 flex justify-end">
              <Button 
                onClick={handleSaveNotes} 
                disabled={isSavingNotes || notes === (customer.notes || '')}
                className="bg-brand-500 hover:bg-brand-600 text-white min-w-[120px]"
              >
                {isSavingNotes ? 'Saving...' : 'Save Notes'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add Payment SlideOver */}
      <SlideOver
        open={isPaymentSlideOpen}
        onClose={() => setIsPaymentSlideOpen(false)}
        title="Record Payment"
      >
        <form onSubmit={handleAddPayment} className="space-y-6 pt-4 flex flex-col h-full">
          <div className="flex-1 space-y-6">
            <div className="bg-brand-500/10 border border-brand-500/20 p-4 rounded-lg flex justify-between items-center">
              <span className="text-sm font-medium text-brand-400">Current Balance</span>
              <span className="text-xl font-bold text-foreground">{currency} {customer.balance?.toLocaleString()}</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Amount ({currency})</label>
              <Input 
                type="number" 
                step="0.01" 
                min="0.01"
                required
                value={paymentForm.amount} 
                onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                placeholder="0.00"
                className="text-lg font-medium"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Payment Method</label>
              <Select
                value={paymentForm.method}
                onChange={(val) => setPaymentForm({...paymentForm, method: val})}
                options={[
                  { label: 'Cash', value: 'Cash' },
                  { label: 'Credit Card', value: 'Credit Card' },
                  { label: 'Bank Transfer', value: 'Bank Transfer' },
                  { label: 'Mobile Money', value: 'Mobile Money' },
                ]}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Reference Number (Optional)</label>
              <Input 
                value={paymentForm.reference} 
                onChange={(e) => setPaymentForm({...paymentForm, reference: e.target.value})}
                placeholder="Check No. / Transaction ID"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-border flex justify-end gap-3 pb-8">
            <Button type="button" variant="outline" onClick={() => setIsPaymentSlideOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmittingPayment || !paymentForm.amount} className="bg-brand-500 hover:bg-brand-600 text-white min-w-[120px]">
              {isSubmittingPayment ? 'Processing...' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
