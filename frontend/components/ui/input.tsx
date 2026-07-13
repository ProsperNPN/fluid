import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Input({ label, id, className, ...props }: InputProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-slate-700">{label}</span>
      <input
        id={id}
        className={cn('w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-fluid-700', className)}
        {...props}
      />
    </label>
  );
}
