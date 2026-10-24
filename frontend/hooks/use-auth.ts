"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { clearTokens, getApiErrorMessage, hasTokens } from '@/lib/api';
import { getCurrentUser, logoutUser } from '@/services/auth-service';
import { getSessionScope, subscribeSession } from '@/lib/api/token-storage';
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
  const scope = useSyncExternalStore(subscribeSession, getSessionScope, () => '');
  const [userScope, setUserScope] = useState(scope);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    if (!hasTokens()) {
      setUser(null);
      setIsLoading(false);
      return null;
    }

    const startedScope = getSessionScope();
    setIsLoading(true);
    setError(null);

    try {
      const currentUser = await getCurrentUser();
      if (startedScope !== getSessionScope()) return null;
      setUserScope(startedScope);
      setUser(currentUser);
      return currentUser;
    } catch (err) {
      if (startedScope !== getSessionScope()) return null;
      clearTokens();
      setUser(null);
      setError(getApiErrorMessage(err, 'Unable to load your account session.'));
      return null;
    } finally {
      if (startedScope === getSessionScope()) setIsLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
  }, []);

  return useMemo(
    () => ({
      user: userScope === scope ? user : null,
      isLoading: userScope !== scope && hasTokens() || isLoading,
      error,
      isAuthenticated: userScope === scope && Boolean(user),
      refreshUser,
      logout,
    }),
    [error, isLoading, logout, refreshUser, user, userScope, scope],
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
