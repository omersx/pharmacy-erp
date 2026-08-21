import { Card } from './card';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  trend?: number;
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ title, value, trend, icon, className }: StatCardProps) {
  const isPositive = trend && trend > 0;
  const isNegative = trend && trend < 0;

  return (
    <Card className={cn("p-5 flex flex-col", className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{title}</h3>
        {icon && <div className="text-gray-400 bg-surface p-2 rounded-lg">{icon}</div>}
      </div>
      <div className="mt-auto min-w-0">
        <div className="text-2xl font-bold text-foreground truncate">{value}</div>
        {trend !== undefined && (
          <div className="flex items-center mt-2 text-sm">
            <span className={cn(
              "flex items-center font-medium",
              isPositive ? "text-success" : isNegative ? "text-danger" : "text-gray-500"
            )}>
              {isPositive ? <TrendingUp size={16} className="mr-1" /> : isNegative ? <TrendingDown size={16} className="mr-1" /> : null}
              {Math.abs(trend)}%
            </span>
            <span className="text-gray-500 ml-2">vs last month</span>
          </div>
        )}
      </div>
    </Card>
  );
}
