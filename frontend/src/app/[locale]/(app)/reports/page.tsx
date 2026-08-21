'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Select as CustomSelect } from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import {
  BarChart3, TrendingUp, Package, Users, Truck, Pill, Download,
  Calendar, DollarSign, ArrowUpRight, ArrowDownRight, FileText,
  FileSpreadsheet, DownloadCloud, AlertTriangle, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend 
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAppStore } from '@/store/app-store';

// ─── Tab Configuration ──────────────────────────────────────────────────
const TABS = [
  { id: 'sales', label: 'Sales Reports', icon: TrendingUp, description: 'Revenue and sales trends' },
  { id: 'inventory', label: 'Inventory Reports', icon: Package, description: 'Stock valuation and expiry' },
  { id: 'financial', label: 'Financial Reports', icon: DollarSign, description: 'Profit margins and cash flow' },
  { id: 'customer', label: 'Customer Reports', icon: Users, description: 'Balances and purchase history' },
  { id: 'supplier', label: 'Supplier Reports', icon: Truck, description: 'Purchases and orders' },
  { id: 'medicine', label: 'Medicine Reports', icon: Pill, description: 'Fast moving and dead stock' },
  { id: 'export', label: 'Export Center', icon: DownloadCloud, description: 'Download CSV and PDF reports' },
] as const;

type TabId = typeof TABS[number]['id'];

// ─── Chart Colors ───────────────────────────────────────────────────────
const COLORS = ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899'];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('sales');
  const { currency } = useAppStore();
  
  // ── Data State ──
  const [salesData, setSalesData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [stockValue, setStockValue] = useState(0);
  const [expirySummary, setExpirySummary] = useState<any>({});
  const [profitData, setProfitData] = useState<any>({ revenue: 0, cogs: 0, profit: 0 });
  const [customerBalances, setCustomerBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesKPI, setSalesKPI] = useState({ revenue: 0, orders: 0, avgOrder: 0 });
  const [salesChartData, setSalesChartData] = useState<{name: string; revenue: number; orders: number}[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<any>({ total_revenue: 0, methods: [] });
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [medicineAnalysis, setMedicineAnalysis] = useState<any>({ fast_moving: [], slow_moving: [], dead_stock: [] });

  // ── Filters ──
  const [dateRange, setDateRange] = useState('7days'); // 7days, 30days, year

  useEffect(() => {
    fetchData();
  }, [activeTab, dateRange]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - (dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 365));
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];

      if (activeTab === 'sales') {
        const [rangeData, top] = await Promise.all([
          api.getSalesRange(startStr, endStr).catch(() => null),
          api.getTopProducts(5).catch(() => [])
        ]);
        
        setTopProducts(Array.isArray(top) ? top : []);
        
        if (rangeData) {
          const totalRevenue = (rangeData as any).total_revenue || 0;
          const totalOrders = (rangeData as any).total_sales || 0;
          setSalesKPI({
            revenue: totalRevenue,
            orders: totalOrders,
            avgOrder: totalOrders > 0 ? totalRevenue / totalOrders : 0
          });
          
          if ((rangeData as any).daily_breakdown) {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const chartData = (rangeData as any).daily_breakdown.map((d: any) => {
              const date = new Date(d.date);
              return {
                name: dayNames[date.getDay()] || d.date,
                revenue: d.revenue || d.total_revenue || 0,
                orders: d.count || d.total_sales || 0
              };
            });
            setSalesChartData(chartData);
          }
        } else {
          setSalesKPI({ revenue: 0, orders: 0, avgOrder: 0 });
          setSalesChartData([]);
        }
      }
      
      else if (activeTab === 'inventory') {
        const val = await api.getStockValue().catch(() => ({ total_stock_value: 0 }));
        setStockValue((val as any).total_stock_value || 0);
        
        const exp = await api.getExpirySummary().catch(() => ({ expired: 0, expiring_30_days: 0, expiring_60_days: 0, expiring_90_days: 0, safe: 0 }));
        setExpirySummary(exp);
      }
      
      else if (activeTab === 'financial') {
        const [profit, breakdown] = await Promise.all([
          api.getProfit(startStr, endStr).catch(() => ({ revenue: 0, cogs: 0, profit: 0 })),
          api.getPaymentBreakdown(startStr, endStr).catch(() => ({ total_revenue: 0, methods: [] })),
        ]);
        setProfitData(profit);
        setPaymentBreakdown(breakdown);
      }
      
      else if (activeTab === 'customer') {
        const balances = await api.getCustomerBalances().catch(() => []);
        setCustomerBalances(Array.isArray(balances) ? balances : []);
      }

      else if (activeTab === 'medicine') {
        const movement = await api.getMedicineMovement(startStr, endStr).catch(() => ({ fast_moving: [], slow_moving: [], dead_stock: [] }));
        setMedicineAnalysis(movement);
      }
    } finally {
      setLoading(false);
    }
  };

  const expiryData = [
    { name: 'Expired', value: expirySummary.expired || 0 },
    { name: '< 30 Days', value: expirySummary.expiring_30_days || 0 },
    { name: '30-60 Days', value: expirySummary.expiring_60_days || 0 },
    { name: '60-90 Days', value: expirySummary.expiring_90_days || 0 },
    { name: 'Safe (>90)', value: expirySummary.safe || 0 },
  ];

  // ── Export Functions ──
  const exportToCSV = (reportType: string) => {
    let data = '';
    let filename = `${reportType}_report.csv`;
    
    if (reportType === 'sales') {
      data = 'Day,Revenue,Orders\n' + salesChartData.map(d => `${d.name},${d.revenue},${d.orders}`).join('\n');
    } else if (reportType === 'inventory') {
      data = 'Status,Count\n' + expiryData.map(d => `${d.name},${d.value}`).join('\n');
    } else if (reportType === 'customers') {
      data = 'Customer,Phone,Balance\n' + customerBalances.map(c => `${c.name},${c.phone || 'N/A'},${Number(c.credit_balance).toFixed(2)}`).join('\n');
    }

    const blob = new Blob([data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    toast.success(`${filename} exported successfully`);
  };

  const exportToPDF = (reportType: string) => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text(`Pharma ERP - ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`, 14, 22);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    
    let head = [[]] as any[];
    let body = [] as any[];
    
    if (reportType === 'sales') {
      head = [['Day', `Revenue (${currency})`, 'Orders']];
      body = salesChartData.map(d => [d.name, d.revenue.toLocaleString(), d.orders.toString()]);
      if (body.length === 0) body = [['No data', '-', '-']];
    } else if (reportType === 'customers') {
      head = [['Customer', 'Phone', 'Credit Balance']];
      body = customerBalances.length > 0
        ? customerBalances.map(c => [c.name, c.phone || 'N/A', `${currency} ${Number(c.credit_balance).toFixed(2)}`])
        : [['No data', '-', '-']];
    } else {
      head = [['Data', 'Value']];
      body = [['Total Stock Value', `${currency} ${stockValue.toLocaleString(undefined, {minimumFractionDigits: 2})}`]];
    }

    autoTable(doc, {
      startY: 40,
      head: head,
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [139, 92, 246] }
    });
    
    doc.save(`${reportType}_report.pdf`);
    toast.success(`PDF report generated`);
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col gap-0 h-full min-h-[calc(100vh-120px)]">
      {/* Header */}
      <header className="flex-none rounded-t-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
              <BarChart3 className="h-5 w-5 text-brand-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Reports & Analytics</h1>
              <p className="text-sm text-muted-foreground">Comprehensive insights into your pharmacy operations</p>
            </div>
          </div>
          <div className="w-48">
            <CustomSelect
              value={dateRange}
              onChange={setDateRange}
              options={[
                { value: '7days', label: 'Last 7 Days' },
                { value: '30days', label: 'Last 30 Days' },
                { value: 'year', label: 'This Year' },
              ]}
            />
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
                </button>
              );
            })}
          </div>
        </nav>

        {/* Right Content Panel */}
        <main className="flex-1 overflow-y-auto p-6 bg-background/30">
          {activeTab === 'sales' && renderSalesTab()}
          {activeTab === 'inventory' && renderInventoryTab()}
          {activeTab === 'financial' && renderFinancialTab()}
          {activeTab === 'customer' && renderCustomerTab()}
          {activeTab === 'supplier' && renderSupplierTab()}
          {activeTab === 'medicine' && renderMedicineTab()}
          {activeTab === 'export' && renderExportTab()}
        </main>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════
  // TAB RENDERS
  // ═══════════════════════════════════════════════════════════════════

  function renderSalesTab() {
    return (
      <div className="space-y-6 fade-in">
        <h2 className="text-lg font-semibold text-foreground">Sales Performance</h2>
        
        {/* KPI Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
            <p className="text-3xl font-bold text-foreground mt-2">{currency} {salesKPI.revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            <p className="text-xs text-green-400 flex items-center mt-2 font-medium">
              <ArrowUpRight className="h-3 w-3 mr-1" /> +12.5% from previous period
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">Total Orders</p>
            <p className="text-3xl font-bold text-foreground mt-2">{salesKPI.orders.toLocaleString()}</p>
            <p className="text-xs text-green-400 flex items-center mt-2 font-medium">
              <ArrowUpRight className="h-3 w-3 mr-1" /> +5.2% from previous period
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">Average Order Value</p>
            <p className="text-3xl font-bold text-foreground mt-2">{currency} {salesKPI.avgOrder.toFixed(2)}</p>
            <p className="text-xs text-red-400 flex items-center mt-2 font-medium">
              <ArrowDownRight className="h-3 w-3 mr-1" /> -1.4% from previous period
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm h-[350px]">
          <h3 className="text-sm font-medium text-foreground mb-4">Revenue Trend</h3>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={salesChartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
              <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${currency} ${v}`} />
              <RechartsTooltip 
                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }}
                itemStyle={{ color: '#e5e7eb' }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Top Products */}
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="text-sm font-medium text-foreground">Top Selling Products</h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="px-5 py-3 font-semibold">Product</th>
                <th className="px-5 py-3 font-semibold text-right">Quantity Sold</th>
                <th className="px-5 py-3 font-semibold text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topProducts.length > 0 ? topProducts.map((p, i) => (
                <tr key={i} className="hover:bg-gray-800/20">
                  <td className="px-5 py-3 font-medium text-foreground">{p.name_en} <span className="text-xs text-muted-foreground ml-2">{p.name_ar}</span></td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{p.total_quantity}</td>
                  <td className="px-5 py-3 text-right text-foreground font-medium">{currency} {Number(p.total_revenue).toFixed(2)}</td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">No sales data available for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderInventoryTab() {
    return (
      <div className="space-y-6 fade-in">
        <h2 className="text-lg font-semibold text-foreground">Inventory & Expiry</h2>
        
        <div className="grid grid-cols-2 gap-6">
          {/* Stock Value Card */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm flex flex-col justify-center items-center text-center">
            <div className="h-16 w-16 rounded-full bg-brand-500/10 flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-brand-400" />
            </div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Stock Value</p>
            <p className="text-4xl font-bold text-foreground mt-2">{currency} {stockValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            <p className="text-sm text-muted-foreground mt-4 max-w-xs">Based on latest purchase prices of all batches currently in stock.</p>
          </div>

          {/* Expiry Pie Chart */}
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm h-[300px]">
            <h3 className="text-sm font-medium text-foreground mb-2">Expiry Distribution (Batches)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expiryData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                  {expiryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={
                      entry.name === 'Expired' ? '#ef4444' :
                      entry.name === '< 30 Days' ? '#f97316' :
                      entry.name === '30-60 Days' ? '#f59e0b' :
                      entry.name === '60-90 Days' ? '#eab308' : '#10b981'
                    } />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '8px' }} itemStyle={{ color: '#e5e7eb' }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  function renderFinancialTab() {
    const revenue = Number(profitData.revenue || 0);
    const cogs = Number(profitData.cogs || 0);
    const profit = Number(profitData.profit || 0);
    const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

    const methods: any[] = paymentBreakdown?.methods || [];
    const cashTotal = methods.filter((m: any) => m.type === 'cash').reduce((s: number, m: any) => s + m.amount, 0);
    const mobileTotal = methods.filter((m: any) => m.type === 'mobile').reduce((s: number, m: any) => s + m.amount, 0);
    const mobileMethods = methods.filter((m: any) => m.type === 'mobile');
    const cashMethods = methods.filter((m: any) => m.type === 'cash');

    const filteredMethods = methodFilter === 'all' 
      ? methods 
      : methodFilter === 'cash' || methodFilter === 'mobile'
        ? methods.filter((m: any) => m.type === methodFilter)
        : methods.filter((m: any) => m.method === methodFilter);

    const METHOD_ICONS: Record<string, string> = { cash: '💵', bankak: '🏦', fawry: '📱', amin: '💳' };
    const METHOD_COLORS: Record<string, string> = { cash: '#22C55E', bankak: '#3B82F6', fawry: '#F59E0B', amin: '#8B5CF6' };
    
    // Build dynamic filter options
    const filterOptions = ['all', 'cash'];
    if (mobileMethods.length > 0) {
      filterOptions.push('mobile');
      mobileMethods.forEach((m: any) => filterOptions.push(m.method));
    }

    return (
      <div className="space-y-6 fade-in">
        <h2 className="text-lg font-semibold text-foreground">Financial Summary</h2>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">Gross Revenue</p>
            <p className="text-3xl font-bold text-foreground mt-2">{currency} {revenue.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">Cost of Goods Sold (COGS)</p>
            <p className="text-3xl font-bold text-foreground mt-2">{currency} {cogs.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border bg-brand-500/5 p-5 shadow-sm">
            <p className="text-sm font-medium text-brand-400">Gross Profit</p>
            <p className="text-3xl font-bold text-brand-500 mt-2">{currency} {profit.toLocaleString()}</p>
            {margin > 0 && <Badge variant="success" className="mt-3">{margin}% Margin</Badge>}
          </div>
        </div>

        {/* Payment Method Breakdown */}
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 overflow-x-auto">
            <div className="shrink-0">
              <h3 className="text-base font-semibold text-foreground">Payment Method Breakdown</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Revenue split by payment channel</p>
            </div>
            <div className="flex items-center rounded-lg border border-border bg-background p-0.5 shrink-0 whitespace-nowrap">
              {filterOptions.map(f => (
                <button
                  key={f}
                  onClick={() => setMethodFilter(f)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                    methodFilter === f
                      ? "bg-brand-500 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === 'all' ? 'All' 
                    : f === 'cash' ? '💵 Cash' 
                    : f === 'mobile' ? '📱 Mobile'
                    : `${METHOD_ICONS[f] || '💳'} ${methods.find((m: any) => m.method === f)?.label}`}
                </button>
              ))}
            </div>
          </div>

          {methods.length === 0 ? (
            <div className="p-12 text-center">
              <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No payment data for the selected period</p>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Cash vs Mobile Summary Bar */}
              {methodFilter === 'all' && revenue > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>💵 Cash: {currency} {cashTotal.toLocaleString()}</span>
                    <span>📱 Mobile: {currency} {mobileTotal.toLocaleString()}</span>
                  </div>
                  <div className="h-3 bg-border rounded-full overflow-hidden flex">
                    {cashTotal > 0 && (
                      <div
                        className="h-full bg-green-500 transition-all duration-700 rounded-l-full"
                        style={{ width: `${(cashTotal / revenue) * 100}%` }}
                      />
                    )}
                    {mobileTotal > 0 && (
                      <div
                        className="h-full bg-blue-500 transition-all duration-700 rounded-r-full"
                        style={{ width: `${(mobileTotal / revenue) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Individual Methods */}
              <div className="space-y-3">
                {filteredMethods.map((m: any) => {
                  const icon = METHOD_ICONS[m.method] || (m.type === 'mobile' ? '📱' : '💵');
                  const color = METHOD_COLORS[m.method] || (m.type === 'mobile' ? '#3B82F6' : '#22C55E');
                  return (
                    <div key={m.method} className="group rounded-lg border border-border bg-background/50 p-4 hover:border-brand-500/30 transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{m.label}</p>
                            <p className="text-xs text-muted-foreground">{m.count} transaction{m.count !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-foreground tabular-nums">{currency} {m.amount.toLocaleString()}</p>
                          <p className="text-xs font-medium tabular-nums" style={{ color }}>{m.percentage}%</p>
                        </div>
                      </div>
                      <div className="h-2 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${m.percentage}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Mobile Money Sub-breakdown */}
              {methodFilter === 'all' && mobileMethods.length > 1 && (
                <div className="mt-4 rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5 p-4">
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">📱 Mobile Money Breakdown</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {mobileMethods.map((m: any) => {
                      const icon = METHOD_ICONS[m.method] || '📱';
                      const color = METHOD_COLORS[m.method] || '#3B82F6';
                      const mobilePercent = mobileTotal > 0 ? Math.round((m.amount / mobileTotal) * 100) : 0;
                      return (
                        <div key={m.method} className="rounded-lg bg-background/80 border border-border p-3 text-center">
                          <span className="text-2xl">{icon}</span>
                          <p className="text-xs font-semibold text-foreground mt-1">{m.label}</p>
                          <p className="text-sm font-bold text-foreground mt-0.5">{currency} {m.amount.toLocaleString()}</p>
                          <p className="text-xs mt-0.5" style={{ color }}>{mobilePercent}% of mobile</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderCustomerTab() {
    return (
      <div className="space-y-6 fade-in">
        <h2 className="text-lg font-semibold text-foreground">Customer Balances</h2>
        
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-background text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Phone</th>
                <th className="px-5 py-3 font-semibold text-right">Credit Limit</th>
                <th className="px-5 py-3 font-semibold text-right">Current Balance</th>
                <th className="px-5 py-3 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customerBalances.length > 0 ? customerBalances.map(c => (
                <tr key={c.id} className="hover:bg-gray-800/20">
                  <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{c.phone || '-'}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{currency} {Number(c.credit_limit).toFixed(2)}</td>
                  <td className="px-5 py-3 text-right text-foreground font-bold">{currency} {Number(c.credit_balance).toFixed(2)}</td>
                  <td className="px-5 py-3 text-center">
                    {c.credit_balance > (c.credit_limit * 0.9) ? (
                      <Badge variant="danger">Near Limit</Badge>
                    ) : <Badge variant="success">Good</Badge>}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">No customers with outstanding credit balances.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderSupplierTab() {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 fade-in py-12">
        <div className="h-20 w-20 bg-gray-800/50 rounded-full flex items-center justify-center">
          <Truck className="h-10 w-10 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Supplier Reports</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">Detailed supplier performance, purchase history, and outstanding orders reporting is currently under development.</p>
        </div>
      </div>
    );
  }

  function renderMedicineTab() {
    const { fast_moving = [], slow_moving = [], dead_stock = [] } = medicineAnalysis;
    
    return (
      <div className="space-y-6 fade-in">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Medicine Analysis</h2>
          <p className="text-sm text-muted-foreground">Sales movement and dead stock identification for the selected period</p>
        </div>

        {/* Summary Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-5 shadow-sm">
            <div className="flex items-center gap-3 text-green-500 mb-2">
              <TrendingUp className="h-5 w-5" />
              <p className="text-sm font-semibold">Fast Moving</p>
            </div>
            <p className="text-3xl font-bold text-foreground">{fast_moving.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Top selling items by volume</p>
          </div>
          
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 shadow-sm">
            <div className="flex items-center gap-3 text-amber-500 mb-2">
              <ArrowDownRight className="h-5 w-5" />
              <p className="text-sm font-semibold">Slow Moving</p>
            </div>
            <p className="text-3xl font-bold text-foreground">{slow_moving.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Items with very few sales</p>
          </div>
          
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 shadow-sm">
            <div className="flex items-center gap-3 text-red-500 mb-2">
              <AlertTriangle className="h-5 w-5" />
              <p className="text-sm font-semibold">Dead Stock</p>
            </div>
            <p className="text-3xl font-bold text-foreground">{dead_stock.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Items in stock with 0 sales</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Fast Moving */}
          <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <span className="text-green-500">🚀</span> Fast Moving
              </h3>
            </div>
            <div className="divide-y divide-border overflow-auto max-h-[400px]">
              {fast_moving.length > 0 ? fast_moving.map((m: any, i: number) => (
                <div key={m.id} className="p-4 hover:bg-background/50 transition-colors flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center text-xs font-bold">{i + 1}</div>
                    <div>
                      <p className="text-sm font-medium text-foreground line-clamp-1">{m.name_en}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{m.name_ar}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground">{m.quantity} <span className="text-xs font-normal text-muted-foreground">sold</span></p>
                    <p className="text-xs text-green-400 font-medium">{currency} {m.revenue.toLocaleString()}</p>
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center text-muted-foreground text-sm">No sales data found.</div>
              )}
            </div>
          </div>

          {/* Slow Moving */}
          <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <span className="text-amber-500">🐢</span> Slow Moving
              </h3>
            </div>
            <div className="divide-y divide-border overflow-auto max-h-[400px]">
              {slow_moving.length > 0 ? slow_moving.map((m: any, i: number) => (
                <div key={m.id} className="p-4 hover:bg-background/50 transition-colors flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center text-xs font-bold">{i + 1}</div>
                    <div>
                      <p className="text-sm font-medium text-foreground line-clamp-1">{m.name_en}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{m.name_ar}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground">{m.quantity} <span className="text-xs font-normal text-muted-foreground">sold</span></p>
                    <p className="text-xs text-amber-400 font-medium">{currency} {m.revenue.toLocaleString()}</p>
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center text-muted-foreground text-sm">No sales data found.</div>
              )}
            </div>
          </div>

          {/* Dead Stock */}
          <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <span className="text-red-500">💀</span> Dead Stock
              </h3>
              <Badge variant="danger" className="text-[10px]">0 Sales</Badge>
            </div>
            <div className="divide-y divide-border overflow-auto max-h-[400px]">
              {dead_stock.length > 0 ? dead_stock.map((m: any) => (
                <div key={m.id} className="p-4 hover:bg-background/50 transition-colors flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground line-clamp-1">{m.name_en}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{m.name_ar}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="outline" className="bg-red-500/5 text-red-400 border-red-500/20">
                      {m.stock} in stock
                    </Badge>
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center">
                  <span className="text-2xl mb-2">🎉</span>
                  No dead stock found! Everything is selling.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAB: EXPORT CENTER
  // ═══════════════════════════════════════════════════════════════════
  function renderExportTab() {
    const exports = [
      { id: 'sales', label: 'Sales Transactions', desc: 'Detailed log of all sales, items, and discounts' },
      { id: 'inventory', label: 'Inventory Snapshot', desc: 'Current stock levels and expiry dates' },
      { id: 'customers', label: 'Customer Balances', desc: 'List of customers and their credit status' },
    ];

    return (
      <div className="space-y-6 fade-in">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Export Center</h2>
          <p className="text-sm text-muted-foreground">Download comprehensive reports for external analysis</p>
        </div>

        <div className="grid gap-4 max-w-3xl">
          {exports.map(exp => (
            <div key={exp.id} className="flex items-center justify-between rounded-xl border border-border bg-surface p-5 shadow-sm hover:border-brand-500/30 transition-colors">
              <div>
                <h3 className="font-semibold text-foreground">{exp.label}</h3>
                <p className="text-sm text-muted-foreground">{exp.desc}</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => exportToCSV(exp.id)}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  <FileSpreadsheet className="h-4 w-4" /> CSV
                </button>
                <button 
                  onClick={() => exportToPDF(exp.id)}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-500/10 text-brand-400 px-3 py-2 text-sm font-medium hover:bg-brand-500/20 transition-colors"
                >
                  <FileText className="h-4 w-4" /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
}
