import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function DonorSidebarItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex min-h-12 cursor-pointer items-center gap-3.5 overflow-hidden rounded-[13px] px-4 py-3 text-[15px] font-medium outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-red-200',
        active
          ? 'bg-[#FDF2F2] font-semibold text-slate-950 shadow-[0_1px_3px_rgba(192,57,43,0.10)]'
          : 'text-slate-600 hover:translate-x-[3px] hover:bg-[#FDF2F2] hover:text-slate-950',
      )}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-[#C0392B]" aria-hidden="true" /> : null}
      <Icon className={cn('h-[18px] w-[18px] shrink-0 transition-colors duration-200', active ? 'text-[#C0392B]' : 'text-slate-400 group-hover:text-[#C0392B]')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && badge > 0 ? <span className="min-w-5 rounded-full bg-[#C0392B] px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-white shadow-sm">{badge > 99 ? '99+' : badge}</span> : null}
    </Link>
  );
}
