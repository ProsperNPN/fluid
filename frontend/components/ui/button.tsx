import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-fluid-700 text-white hover:bg-fluid-800',
  secondary: 'border border-slate-300 text-slate-700 hover:border-fluid-700 hover:text-fluid-700',
  ghost: 'text-slate-600 hover:bg-slate-100'
};

export function Button({ variant = 'primary', fullWidth = false, className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md',
        variants[variant],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
