"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { clearTokens, getApiErrorMessage, hasTokens } from '@/lib/api';
import { getCurrentUser, logoutUser } from '@/services/auth-service';
import type { AuthUser } from '@/types/auth';

export type DashboardRole = 'donor' | 'hospital' | 'admin';

export function resolveDashboardRole(user: AuthUser): DashboardRole {
  if (user.is_superuser || user.role === 'admin') return 'admin';
  if (user.role === 'hospital') return 'hospital';
  return 'donor';
}

export function getDefaultAuthenticatedRoute(user: AuthUser): string {
  const role = resolveDashboardRole(user);
  if (role === 'admin') return '/admin';
  if (role === 'hospital') return '/hospital';
  return '/donor';
}

export function useAuthState() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    if (!hasTokens()) {
      setUser(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (err) {
      clearTokens();
      setUser(null);
      setError(getApiErrorMessage(err, 'Unable to load your account session.'));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
  }, []);

  return useMemo(
    () => ({
      user,
      isLoading,
      error,
      isAuthenticated: Boolean(user),
      refreshUser,
      logout,
    }),
    [error, isLoading, logout, refreshUser, user],
  );
}

export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuthState();

  useEffect(() => {
    if (auth.isLoading) return;

    if (!auth.isAuthenticated) {
      const nextPath = pathname ? `?next=${encodeURIComponent(pathname)}` : '';
      router.replace(`/auth/login${nextPath}`);
    }
  }, [auth.isAuthenticated, auth.isLoading, pathname, router]);

  return auth;
}
