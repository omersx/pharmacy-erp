import * as React from 'react';
import { cn } from '@/lib/utils'; // Assuming cn exists

const badgeVariants = {
  success: 'bg-green-500/10 text-green-400 border border-green-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  danger: 'bg-red-500/10 text-red-400 border border-red-500/20',
  info: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  default: 'bg-gray-800 text-gray-300 border border-gray-700',
  outline: 'text-foreground border border-input',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof badgeVariants;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}
