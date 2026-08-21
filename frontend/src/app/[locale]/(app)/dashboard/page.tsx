'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { useAppStore } from '@/store/app-store';
import { formatMoney } from '@/lib/utils';
import { api } from '@/lib/api';
import { CreditCard, Package, AlertTriangle, TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';


export default function DashboardPage() {
  const t = useTranslations();
  const params = useParams();
  const locale = params.locale as string;
  const { currency } = useAppStore();

  const [stats, setStats] = useState({
    todaySales: 0,
    revenue: 0,
    outOfStock: 0,
    lowStock: 0,
    expiring: 0
  });
  const [chartData, setChartData] = useState<{name: string; revenue: number}[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // Calculate start of current week (Sunday)
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const weekStartStr = startOfWeek.toISOString().split('T')[0];
        
        const [outOfStock, lowStock, expiring, recent, dailySales, weeklyRange] = await Promise.all([
          api.getOutOfStock().catch(() => []),
          api.getLowStock().catch(() => []),
          api.getExpiring().catch(() => []),
          api.getSales().catch(() => []),
          api.getDailySales(todayStr).catch(() => ({ total_sales_count: 0, total_amount: 0 })),
          api.getSalesRange(weekStartStr, todayStr).catch(() => null)
        ]);
        
        setStats({
          todaySales: (dailySales as any)?.total_amount || 0,
          revenue: (weeklyRange as any)?.total_revenue || (dailySales as any)?.total_amount || 0,
          outOfStock: Array.isArray(outOfStock) ? outOfStock.length : 0,
          lowStock: Array.isArray(lowStock) ? lowStock.length : 0,
          expiring: Array.isArray(expiring) ? expiring.length : 0
        });

        const recentArray = Array.isArray(recent) ? recent : (recent as any)?.items || [];
        setRecentSales(recentArray.slice(0, 5));

        // Build weekly chart data
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weekData = dayNames.map((name, i) => {
          const dayDate = new Date(startOfWeek);
          dayDate.setDate(startOfWeek.getDate() + i);
          return { name, revenue: 0, date: dayDate.toISOString().split('T')[0] };
        });
        
        if ((weeklyRange as any)?.daily_breakdown) {
          (weeklyRange as any).daily_breakdown.forEach((d: any) => {
            const found = weekData.find(w => w.date === d.date);
            if (found) found.revenue = d.revenue || d.total_revenue || 0;
          });
        }
        
        setChartData(weekData.map(({ name, revenue }) => ({ name, revenue })));
      } catch (error) {
        console.error('Failed to load dashboard data', error);
      }
    }
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-gray-500">Welcome back. Here is what's happening today.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard 
          title={t('dashboard.todaySales')}
          value={formatMoney(stats.todaySales, currency)}
          icon={<CreditCard size={20} />}
        />
        <StatCard 
          title={t('dashboard.revenue')}
          value={formatMoney(stats.revenue, currency)}
          icon={<TrendingUp size={20} />}
        />
        <StatCard 
          title="Out of Stock"
          value={`${stats.outOfStock} Items`}
          icon={<Package size={20} className="text-danger" />}
        />
        <StatCard 
          title={t('dashboard.lowStock')}
          value={`${stats.lowStock} Items`}
          icon={<AlertTriangle size={20} className="text-warning" />}
        />
        <StatCard 
          title={t('dashboard.expiringMedicines')}
          value={`${stats.expiring} Items`}
          icon={<AlertTriangle size={20} className="text-danger" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 p-4 md:p-6">
          <h3 className="font-semibold text-lg mb-4">Sales Overview</h3>
          <div className="h-64 md:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--foreground)', opacity: 0.5}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--foreground)', opacity: 0.5}} tickFormatter={(value) => `${value}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--brand-primary)' }}
                  formatter={(value: number) => formatMoney(value, currency)}
                />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--brand-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6 flex flex-col">
          <h3 className="font-semibold text-lg mb-4">{t('dashboard.recentTransactions')}</h3>
          <div className="space-y-4 flex-1 overflow-y-auto">
            {recentSales.length > 0 ? (
              recentSales.map((sale: any) => (
                <div key={sale.id} className="flex justify-between items-center p-3 hover:bg-surface rounded-lg transition-colors border border-transparent hover:border-border">
                  <div>
                    <div className="font-medium text-sm">{sale.invoice_number || sale.id.substring(0, 8)}</div>
                    <div className="text-xs text-gray-500">{sale.customer?.name || 'Walk-in Customer'}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-sm">{formatMoney(sale.total_amount || 0, currency)}</div>
                    <div className="text-xs text-success">Completed</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                <CreditCard size={32} className="text-foreground/20 mb-2" />
                <p className="text-sm text-foreground/40">No recent transactions</p>
                <p className="text-xs text-foreground/30 mt-1">Sales will appear here once processed</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
