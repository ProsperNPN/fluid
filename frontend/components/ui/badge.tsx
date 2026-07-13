import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-700'
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', tones[tone])}>{children}</span>;
}
