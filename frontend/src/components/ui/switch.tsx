import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  className?: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, label, description, className, disabled }: SwitchProps) {
  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <SwitchPrimitives.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          "peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1220] disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-brand-500" : "bg-gray-600"
        )}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
            "data-[state=unchecked]:translate-x-0",
            "ltr:data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5",
            checked
              ? "ltr:translate-x-5 rtl:-translate-x-5"
              : "translate-x-0"
          )}
        />
      </SwitchPrimitives.Root>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <label
              className="text-sm font-medium text-gray-200 cursor-pointer"
              onClick={() => !disabled && onCheckedChange(!checked)}
            >
              {label}
            </label>
          )}
          {description && <span className="text-xs text-gray-400">{description}</span>}
        </div>
      )}
    </div>
  );
}
