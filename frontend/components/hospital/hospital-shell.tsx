"use client";

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Droplets,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Settings,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { FluidLogo } from '@/components/brand/fluid-logo';
import { DonorSidebarItem } from '@/components/donor/donor-sidebar-item';
import { LoadingState } from '@/components/ui/loading-state';
import { getDefaultAuthenticatedRoute, resolveDashboardRole, useRequireAuth } from '@/hooks/use-auth';
import { getApiErrorMessage } from '@/lib/api';
import { listNotifications } from '@/services/notifications-service';
import { getHospitalProfile } from '@/services/profile-service';

const navigation: Array<{ href: string; label: string; icon: typeof LayoutDashboard; badge?: boolean; adminOnly?: boolean }> = [
  { href: '/hospital', label: 'Overview', icon: LayoutDashboard },
  { href: '/hospital/requests', label: 'Blood Requests', icon: Droplets },
  { href: '/hospital/donors', label: 'Donor Responses', icon: UserRoundCheck },
  { href: '/hospital/appointments', label: 'Appointments', icon: CalendarDays },
  { href: '/hospital/inventory', label: 'Blood Inventory', icon: PackageSearch },
  { href: '/hospital/notifications', label: 'Notifications', icon: Bell, badge: true },
  { href: '/hospital/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/hospital/profile', label: 'Hospital Profile', icon: Settings },
  { href: '/hospital/staff', label: 'Staff Management', icon: Users, adminOnly: true },
];

const pageMeta: Record<string, { title: string; description: string }> = {
  '/hospital': { title: 'Overview', description: 'Blood operations and hospital activity at a glance.' },
  '/hospital/requests': { title: 'Blood Requests', description: 'Create and manage hospital blood requests.' },
  '/hospital/donors': { title: 'Donor Responses', description: 'Review compatible donors who responded to requests.' },
  '/hospital/appointments': { title: 'Appointments', description: 'Coordinate donation appointments and outcomes.' },
  '/hospital/inventory': { title: 'Blood Inventory', description: 'Monitor stock, reservations, and expiration risk.' },
  '/hospital/notifications': { title: 'Notifications', description: 'Operational alerts and donor activity.' },
  '/hospital/analytics': { title: 'Analytics', description: 'Request, response, appointment, and inventory performance.' },
  '/hospital/profile': { title: 'Hospital Profile', description: 'Organization details and verification status.' },
  '/hospital/staff': { title: 'Staff Management', description: 'Roles and access for your hospital team.' },
};

export function HospitalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading, logout, user, error } = useRequireAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [memberRole, setMemberRole] = useState<string>('hospital_staff');
  const role = user ? resolveDashboardRole(user) : null;
  const isAllowed = role === 'hospital';
  const meta = pageMeta[pathname] ?? pageMeta['/hospital'];
  const initials = (user?.full_name || 'FLUID Hospital').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  useEffect(() => { setDrawerOpen(false); setProfileOpen(false); }, [pathname]);
  useEffect(() => { if (isAuthenticated && isAllowed) void listNotifications().then((data) => setUnreadCount(data.unreadCount)).catch(() => undefined); }, [isAllowed, isAuthenticated, pathname]);
  useEffect(() => { if (isAuthenticated && isAllowed) void getHospitalProfile().then((profile) => setMemberRole(profile.memberRole)).catch(() => undefined); }, [isAllowed, isAuthenticated]);
  useEffect(() => { if (!isLoading && isAuthenticated && user && !isAllowed) router.replace(getDefaultAuthenticatedRoute(user)); }, [isAllowed, isAuthenticated, isLoading, router, user]);

  const handleLogout = async () => {
    try { await logout(); router.replace('/auth/login'); }
    catch (logoutError) { toast.error(getApiErrorMessage(logoutError, 'Unable to log out right now.')); }
  };

  if (isLoading || !isAuthenticated || !isAllowed) return <div className="min-h-screen bg-slate-50 p-6"><LoadingState text="Preparing hospital operations..." /></div>;

  const sidebar = <div className="flex h-full min-h-0 flex-col overflow-hidden">
    <div className="flex min-h-[94px] items-center justify-between border-b border-[#EAEAEA] px-6 py-5">
      <Link href="/hospital" aria-label="FLUID hospital overview" className="group flex min-w-0 items-center gap-3.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-red-200">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FDF2F2] p-1.5 shadow-sm ring-1 ring-red-100/80 transition duration-200 group-hover:scale-[1.03]"><FluidLogo className="h-full w-full object-contain" /></span>
        <span className="min-w-0"><span className="block text-xl font-bold leading-tight tracking-[-0.03em] text-slate-950">FLUID</span><span className="mt-0.5 block whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Hospital Workspace</span></span>
      </Link>
      <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><X className="h-5 w-5" /></button>
    </div>
    <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-6" aria-label="Hospital dashboard">
      {navigation.filter((item) => !item.adminOnly || memberRole === 'hospital_admin').map((item) => {
        const active = item.href === '/hospital' ? pathname === item.href : pathname.startsWith(item.href);
        return <DonorSidebarItem key={item.href} href={item.href} label={item.label} icon={item.icon} active={active} badge={item.badge ? unreadCount : undefined} />;
      })}
    </nav>
    <div className="border-t border-[#EAEAEA] p-4"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm"><p className="text-sm font-semibold text-slate-900">Operations support</p><p className="mt-1.5 text-xs leading-5 text-slate-500">Need help with requests, verification, or access?</p><a href="mailto:support@fluid.health" className="mt-3 inline-flex w-full justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-red-200 hover:bg-[#FDF2F2] hover:text-[#C0392B]">Contact Support</a></div></div>
  </div>;

  return <div className="min-h-screen bg-[#F7F8FA]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-[#EAEAEA] bg-white shadow-[4px_0_18px_rgba(15,23,42,0.035)] lg:block">{sidebar}</aside>
    {drawerOpen ? <div className="fixed inset-0 z-40 lg:hidden"><button className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} aria-label="Close navigation overlay" /><aside className="relative h-full w-[min(272px,88vw)] bg-white shadow-2xl">{sidebar}</aside></div> : null}
    <div className="lg:pl-[272px]">
      <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-white/95 backdrop-blur"><div className="flex h-20 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-semibold text-slate-950 sm:text-xl">{meta.title}</h1><p className="hidden truncate text-xs text-slate-500 sm:block">{meta.description}</p></div>
        <Link href="/hospital/notifications" className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Notifications"><Bell className="h-5 w-5" />{unreadCount ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C0392B] px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}</Link>
        <Link href="/" className="hidden text-sm font-medium text-slate-600 hover:text-[#C0392B] sm:block">Back to site</Link>
        <div className="relative"><button onClick={() => setProfileOpen((value) => !value)} className="flex items-center gap-2 rounded-xl p-1.5 text-left hover:bg-slate-50"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C0392B] text-xs font-bold text-white">{initials}</span><span className="hidden max-w-40 md:block"><span className="block truncate text-sm font-semibold text-slate-900">{user?.full_name || 'FLUID Hospital'}</span><span className="block text-xs capitalize text-slate-500">{memberRole.replaceAll('_', ' ')}</span></span><ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" /></button>
          {profileOpen ? <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><Link href="/hospital/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />Hospital profile</Link><Link href="/hospital/requests" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><ClipboardList className="h-4 w-4" />Request activity</Link><button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" />Log out</button></div> : null}
        </div>
      </div></header>
      <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">{error ? <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}<div className="animate-dashboard-in">{children}</div></main>
    </div>
  </div>;
}
