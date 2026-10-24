import { apiClient, clearTokens, getRefreshToken, setTokens } from '@/lib/api';
import {
  ensureBoolean,
  ensureEnum,
  ensureNullableString,
  ensureRecord,
  ensureString,
} from '@/lib/api/contracts';
import { getSessionScope } from "@/lib/api/token-storage";
import type {
  AuthUser,
  ForgotPasswordPayload,
  ForgotPasswordResponse,
  LoginPayload,
  LogoutPayload,
  RegisterPayload,
  ResetPasswordPayload,
  TokenPairResponse,
} from '@/types/auth';

function parseAuthUser(data: unknown, context: string): AuthUser {
  const record = ensureRecord(data, context);
  const isSuperuser = ensureBoolean(record.is_superuser, `${context}.is_superuser`);
  const rawRole = record.role;
  const role =
    typeof rawRole === 'string'
      ? ensureEnum(rawRole, ['donor', 'hospital', 'admin'] as const, `${context}.role`)
      : isSuperuser
        ? 'admin'
        : 'donor';

  return {
    id: ensureString(record.id, `${context}.id`),
    email: ensureString(record.email, `${context}.email`),
    full_name: ensureNullableString(record.full_name, `${context}.full_name`),
    role,
    is_active: ensureBoolean(record.is_active, `${context}.is_active`),
    is_superuser: isSuperuser,
    created_at: ensureString(record.created_at, `${context}.created_at`),
  };
}

function parseTokenPair(data: unknown, context: string): TokenPairResponse {
  const record = ensureRecord(data, context);

  return {
    access_token: ensureString(record.access_token, `${context}.access_token`),
    refresh_token: ensureString(record.refresh_token, `${context}.refresh_token`),
    token_type: ensureString(record.token_type, `${context}.token_type`),
    access_token_expires_at: ensureString(record.access_token_expires_at, `${context}.access_token_expires_at`),
    refresh_token_expires_at: ensureString(record.refresh_token_expires_at, `${context}.refresh_token_expires_at`),
  };
}

export async function registerUser(payload: RegisterPayload): Promise<AuthUser> {
  const response = await apiClient.post<unknown>('/api/v1/auth/register', payload);
  return parseAuthUser(response.data, 'auth.register response');
}

export async function loginUser(payload: LoginPayload): Promise<TokenPairResponse> {
  const response = await apiClient.post<unknown>('/api/v1/auth/login', payload);
  const data = parseTokenPair(response.data, 'auth.login response');

  setTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  });

  return data;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const response = await apiClient.get<unknown>('/api/v1/users/me');
  return parseAuthUser(response.data, 'users.me response');
}

export async function logoutUser(): Promise<void> {
  const sessionScope = getSessionScope();
  const refreshToken = getRefreshToken();
  const payload: LogoutPayload | undefined = refreshToken ? { refresh_token: refreshToken } : undefined;

  try {
    await apiClient.post('/api/v1/auth/logout', payload);
  } finally {
    if (getSessionScope() === sessionScope) clearTokens();
  }
}

export async function requestPasswordReset(payload: ForgotPasswordPayload): Promise<ForgotPasswordResponse> {
  const response = await apiClient.post<unknown>('/api/v1/auth/forgot-password', payload);
  const record = ensureRecord(response.data, 'auth.forgot-password response');

  return {
    message: ensureString(record.message, 'auth.forgot-password response.message'),
    reset_token: ensureNullableString(record.reset_token, 'auth.forgot-password response.reset_token'),
  };
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<string> {
  const response = await apiClient.post<unknown>('/api/v1/auth/reset-password', payload);
  const record = ensureRecord(response.data, 'auth.reset-password response');
  return ensureString(record.message, 'auth.reset-password response.message');
}
