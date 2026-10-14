"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { FluidLogo } from '@/components/brand/fluid-logo';
import { Sidebar, type SidebarItem } from '@/components/layout/sidebar';
import { getDefaultAuthenticatedRoute, resolveDashboardRole, type DashboardRole, useRequireAuth } from '@/hooks/use-auth';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api';

export function DashboardLayout({
  title,
  subtitle,
  currentPath,
  sidebarItems,
  requiredRole,
  children
}: {
  title: string;
  subtitle: string;
  currentPath: string;
  sidebarItems: SidebarItem[];
  requiredRole?: DashboardRole;
  children: ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading, logout, user, error } = useRequireAuth();
  const activeRole = user ? resolveDashboardRole(user) : null;
  const isRoleAllowed = !requiredRole || activeRole === requiredRole;

  useEffect(() => {
    if (!isLoading && isAuthenticated && user && !isRoleAllowed) {
      router.replace(getDefaultAuthenticatedRoute(user));
    }
  }, [isAuthenticated, isLoading, isRoleAllowed, router, user]);

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/auth/login');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to log out right now. Please try again.'));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <LoadingState text="Checking your session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <LoadingState text="Redirecting to login..." />
      </div>
    );
  }

  if (!isRoleAllowed) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
        <LoadingState text="Redirecting to your dashboard..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div>
            <Link href="/"><FluidLogo variant="compact" className="h-7 text-[28px]" /></Link>
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium text-slate-900">{user?.full_name ?? 'FLUID User'}</p>
              <p className="text-xs text-slate-500">{user?.email}</p>
            </div>
            <span className="rounded-full bg-fluid-50 px-3 py-1 text-xs font-medium text-fluid-700">
              {activeRole === 'admin' ? 'Admin' : activeRole === 'hospital' ? 'Hospital' : 'Donor'}
            </span>
            <Link href="/" className="text-slate-600 hover:text-fluid-700">
              Back to site
            </Link>
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-7xl">
        <Sidebar title={subtitle} items={sidebarItems} currentPath={currentPath} />
        <main className="w-full p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
