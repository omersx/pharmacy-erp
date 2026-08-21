import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils'; // Assuming cn exists

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export function Switch({ checked, onCheckedChange, label, description }: SwitchProps) {
  return (
    <div className="flex items-center space-x-3">
      <SwitchPrimitives.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={cn(
          "peer inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1220] disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-brand-500" : "bg-gray-600"
        )}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </SwitchPrimitives.Root>
      {(label || description) && (
        <div className="flex flex-col">
          {label && <label className="text-sm font-medium text-gray-200 cursor-pointer" onClick={() => onCheckedChange(!checked)}>{label}</label>}
          {description && <span className="text-xs text-gray-400">{description}</span>}
        </div>
      )}
    </div>
  );
}
