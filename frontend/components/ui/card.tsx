import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg', className)}>{children}</div>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-slate-900">{children}</h3>;
}

export function CardValue({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-2xl font-bold text-slate-900">{children}</p>;
}
