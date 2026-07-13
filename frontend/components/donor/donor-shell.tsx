"use client";

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardClock,
  Droplets,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { FluidLogo } from '@/components/brand/fluid-logo';
import { LoadingState } from '@/components/ui/loading-state';
import { getDefaultAuthenticatedRoute, resolveDashboardRole, useRequireAuth } from '@/hooks/use-auth';
import { getApiErrorMessage } from '@/lib/api';
import { listNotifications } from '@/services/notifications-service';
import { DonorSidebarItem } from '@/components/donor/donor-sidebar-item';

const navigation: Array<{ href: string; label: string; icon: typeof LayoutDashboard; badge?: boolean }> = [
  { href: '/donor', label: 'Overview', icon: LayoutDashboard },
  { href: '/donor/requests', label: 'Blood Requests', icon: Droplets },
  { href: '/donor/appointments', label: 'Appointments', icon: CalendarDays },
  { href: '/donor/history', label: 'Donation History', icon: History },
  { href: '/donor/notifications', label: 'Notifications', icon: Bell, badge: true },
  { href: '/donor/profile', label: 'Profile & Settings', icon: Settings },
];

const pageMeta: Record<string, { title: string; description: string }> = {
  '/donor': { title: 'Overview', description: 'Your donation activity and nearby opportunities.' },
  '/donor/requests': { title: 'Blood Requests', description: 'Compatible requests from verified hospitals.' },
  '/donor/appointments': { title: 'Appointments', description: 'Manage your upcoming donation schedule.' },
  '/donor/history': { title: 'Donation History', description: 'Review your past donations and outcomes.' },
  '/donor/notifications': { title: 'Notifications', description: 'Important request, appointment, and eligibility updates.' },
  '/donor/profile': { title: 'Profile & Settings', description: 'Keep your donor details and preferences current.' },
};

export function DonorShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, logout, user, error } = useRequireAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const role = user ? resolveDashboardRole(user) : null;
  const isAllowed = role === 'donor';
  const meta = pageMeta[pathname] ?? pageMeta['/donor'];
  const initials = (user?.full_name || 'FLUID Donor')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isAuthenticated && isAllowed) void listNotifications().then((data) => setUnreadCount(data.unreadCount)).catch(() => undefined);
  }, [isAllowed, isAuthenticated, pathname]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user && !isAllowed) {
      router.replace(getDefaultAuthenticatedRoute(user));
    }
  }, [isAllowed, isAuthenticated, isLoading, router, user]);

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/auth/login');
    } catch (logoutError) {
      toast.error(getApiErrorMessage(logoutError, 'Unable to log out right now. Please try again.'));
    }
  };

  if (isLoading || !isAuthenticated || !isAllowed) {
    return <div className="min-h-screen bg-slate-50 p-6"><LoadingState text="Preparing your donor workspace..." /></div>;
  }

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-[94px] items-center justify-between border-b border-[#EAEAEA] px-6 py-5">
        <Link href="/donor" aria-label="FLUID donor overview" className="group flex min-w-0 items-center gap-3.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-red-200">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FDF2F2] p-1.5 shadow-sm ring-1 ring-red-100/80 transition-transform duration-200 ease-out group-hover:scale-[1.03]">
            <FluidLogo className="h-full w-full object-contain" />
          </span>
          <span className="min-w-0">
            <span className="block text-xl font-bold leading-tight tracking-[-0.03em] text-slate-950">FLUID</span>
            <span className="mt-0.5 block whitespace-nowrap text-[11px] font-medium uppercase leading-tight tracking-[0.12em] text-slate-400">Donor Workspace</span>
          </span>
        </Link>
        <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-6" aria-label="Donor dashboard">
        {navigation.map((item) => {
          const active = item.href === '/donor' ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <DonorSidebarItem key={item.href} href={item.href} label={item.label} icon={item.icon} active={active} badge={item.badge ? unreadCount : undefined} />
          );
        })}
      </nav>
      <div className="border-t border-[#EAEAEA] p-4">
        <div className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300 hover:bg-white hover:shadow-md">
          <p className="text-sm font-semibold text-slate-900">Need help?</p>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">Questions about donating or your account?</p>
          <a href="mailto:support@fluid.health" className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors duration-200 hover:border-red-200 hover:bg-[#FDF2F2] hover:text-[#C0392B]">Contact Support</a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-[#EAEAEA] bg-white shadow-[4px_0_18px_rgba(15,23,42,0.035)] lg:block">{sidebar}</aside>
      {mobileOpen ? <div className="fixed inset-0 z-40 lg:hidden"><button className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" /><aside className="relative h-full w-[min(272px,88vw)] border-r border-[#EAEAEA] bg-white shadow-2xl">{sidebar}</aside></div> : null}

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 backdrop-blur">
          <div className="flex h-20 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold text-slate-950 sm:text-xl">{meta.title}</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{meta.description}</p>
            </div>
            <Link href="/donor/notifications" className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50" aria-label="Notifications"><Bell className="h-5 w-5" />{unreadCount > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C0392B] px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}</Link>
            <Link href="/" className="hidden text-sm font-medium text-slate-600 hover:text-[#C0392B] sm:block">Back to site</Link>
            <div className="relative">
              <button onClick={() => setProfileOpen((open) => !open)} className="flex items-center gap-2 rounded-xl p-1.5 text-left hover:bg-slate-50" aria-expanded={profileOpen}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C0392B] text-xs font-bold text-white">{initials}</span>
                <span className="hidden max-w-36 md:block"><span className="block truncate text-sm font-semibold text-slate-900">{user?.full_name || 'FLUID Donor'}</span><span className="block text-xs text-slate-500">Donor</span></span>
                <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
              </button>
              {profileOpen ? <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><Link href="/donor/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />Profile & Settings</Link><Link href="/donor/history" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><ClipboardClock className="h-4 w-4" />Donation activity</Link><button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" />Log out</button></div> : null}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
          {error ? <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}
          <div className="animate-dashboard-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
