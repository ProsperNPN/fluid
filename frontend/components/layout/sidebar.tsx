import { FluidLogo } from '@/components/brand/fluid-logo';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface SidebarItem {
  href: string;
  label: string;
}

export function Sidebar({ title, items, currentPath }: { title: string; items: SidebarItem[]; currentPath: string }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
      <Link href="/" className="mb-3 block"><FluidLogo variant="compact" /></Link>
      <p className="mb-4 text-sm font-semibold text-slate-500">{title}</p>
      <nav className="space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'block rounded-lg px-3 py-2 text-sm text-slate-700  hover:bg-slate-100',
              currentPath === item.href && 'bg-fluid-50 font-medium text-fluid-700'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
