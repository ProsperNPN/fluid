export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const ACCESS_TOKEN_KEY = 'fluid.access_token';
const REFRESH_TOKEN_KEY = 'fluid.refresh_token';
const SESSION_KEY = 'fluid.session_scope';

function subject(token: string | null): string | null {
  try { return token ? JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub : null; } catch { return null; }
}

// Cache identity only; the server remains the authority for authentication.
export function getSessionScope(): string {
  if (!isBrowser()) return '';
  return window.localStorage.getItem(SESSION_KEY) || subject(getAccessToken()) || '';
}

export function subscribeSession(listener: () => void): () => void {
  const changed = (event: StorageEvent) => {
    if (event.key === null || [SESSION_KEY, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY].includes(event.key)) listener();
  };
  window.addEventListener('fluid:session-changed', listener);
  window.addEventListener('storage', changed);
  return () => { window.removeEventListener('fluid:session-changed', listener); window.removeEventListener('storage', changed); };
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function getAccessToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens: AuthTokens): void {
  if (!isBrowser()) return;
  const changed = !getAccessToken() || subject(getAccessToken()) !== subject(tokens.accessToken);
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  if (changed) {
    window.localStorage.setItem(SESSION_KEY, crypto.randomUUID());
    window.dispatchEvent(new Event('fluid:session-changed'));
  }
}

export function clearTokens(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event('fluid:session-ended'));
  window.dispatchEvent(new Event('fluid:session-changed'));
}

export function hasTokens(): boolean {
  return Boolean(getAccessToken() && getRefreshToken());
}
