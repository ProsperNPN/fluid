import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

import { clearTokens, getAccessToken, getRefreshToken, getSessionScope, setTokens } from './token-storage';

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _sessionScope?: string;
  _retry?: boolean;
  _retryCount?: number;
  skipAuth?: boolean;
}

interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiBaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_API_URL environment variable.');
}

const TOKEN_REFRESH_PATH = '/api/v1/auth/refresh';
const MAX_TRANSIENT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;

const publicAuthPaths = new Set<string>([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  TOKEN_REFRESH_PATH,
]);

const idempotentMethods = new Set<string>(['get', 'head', 'options']);

const refreshClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshPromise: Promise<string | null> | null = null;

function shouldAttachToken(config: RetryableRequestConfig): boolean {
  if (config.skipAuth) return false;
  const path = config.url ?? '';
  return !publicAuthPaths.has(path);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryTransientError(error: AxiosError, config: RetryableRequestConfig): boolean {
  const method = (config.method ?? 'get').toLowerCase();
  if (!idempotentMethods.has(method)) {
    return false;
  }

  const status = error.response?.status;
  if (status === undefined) {
    return true;
  }

  return status === 408 || status === 429 || status >= 500;
}

async function retryWithBackoff(config: RetryableRequestConfig): Promise<unknown> {
  const retryCount = config._retryCount ?? 0;
  config._retryCount = retryCount + 1;

  const delayMs = RETRY_BASE_DELAY_MS * 2 ** retryCount;
  await sleep(delayMs);

  return apiClient(config);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    return null;
  }

  try {
    const response = await refreshClient.post<TokenRefreshResponse>(
      TOKEN_REFRESH_PATH,
      { refresh_token: refreshToken },
      { headers: { Authorization: undefined } },
    );

    if (getRefreshToken() !== refreshToken) return null;
    setTokens({
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
    });

    return response.data.access_token;
  } catch {
    if (getRefreshToken() === refreshToken) clearTokens();
    return null;
  }
}

apiClient.interceptors.request.use((config) => {
  const requestConfig = config as RetryableRequestConfig;
  if (requestConfig._sessionScope !== undefined && requestConfig._sessionScope !== getSessionScope()) throw new Error('Account session changed');
  requestConfig._sessionScope = getSessionScope();

  if (shouldAttachToken(requestConfig)) {
    const accessToken = getAccessToken();
    if (accessToken) {
      requestConfig.headers.Authorization = `Bearer ${accessToken}`;
    }
  }

  return requestConfig;
});

apiClient.interceptors.response.use(
  (response) => {
    if ((response.config as RetryableRequestConfig)._sessionScope !== getSessionScope()) throw new Error('Account session changed');
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    if (originalRequest._sessionScope !== getSessionScope()) return Promise.reject(new Error('Account session changed'));
    const status = error.response?.status;
    const requestPath = originalRequest.url ?? '';
    const canRetry = status === 401 && !originalRequest._retry && !publicAuthPaths.has(requestPath);

    if (!canRetry) {
      const retryCount = originalRequest._retryCount ?? 0;
      if (retryCount < MAX_TRANSIENT_RETRIES && shouldRetryTransientError(error, originalRequest)) {
        return retryWithBackoff(originalRequest);
      }

      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const newAccessToken = await refreshPromise;

    if (!newAccessToken) {
      return Promise.reject(error);
    }

    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
    return apiClient(originalRequest);
  },
);
