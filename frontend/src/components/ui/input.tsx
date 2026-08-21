import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leadingIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, leadingIcon, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {leadingIcon && (
          <div className="absolute left-3 text-gray-400">
            {leadingIcon}
          </div>
        )}
        <input
          className={cn(
            "flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow",
            leadingIcon && "pl-10",
            error && "border-danger focus:ring-danger",
            className
          )}
          ref={ref}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = 'Input';
