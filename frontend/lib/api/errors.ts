import axios from 'axios';
import { ApiContractError } from './contracts';

export interface ApiValidationIssue {
  field: string | null;
  message: string;
}

function normalizeValidationMessage(message: string): string {
  return message.replace(/^Value error,\s*/i, '').trim();
}

function getValidationDetail(error: unknown): string | null {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;

  if (typeof detail === 'string') {
    return normalizeValidationMessage(detail);
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown };
    if (typeof first?.msg === 'string') {
      return normalizeValidationMessage(first.msg);
    }
  }

  return null;
}

export function getApiStatusCode(error: unknown): number | null {
  if (!axios.isAxiosError(error)) {
    return null;
  }
  return error.response?.status ?? null;
}

export function getApiValidationIssues(error: unknown): ApiValidationIssue[] {
  if (!axios.isAxiosError(error)) {
    return [];
  }

  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;

  if (typeof detail === 'string') {
    return [{ field: null, message: normalizeValidationMessage(detail) }];
  }

  if (!Array.isArray(detail)) {
    return [];
  }

  return detail
    .map((item) => {
      const row = item as { loc?: unknown; msg?: unknown };
      const msg = typeof row.msg === 'string' ? normalizeValidationMessage(row.msg) : null;

      let field: string | null = null;
      if (Array.isArray(row.loc) && row.loc.length > 0) {
        const last = row.loc[row.loc.length - 1];
        field = typeof last === 'string' ? last : null;
      }

      if (!msg) {
        return null;
      }

      return { field, message: msg };
    })
    .filter((item): item is ApiValidationIssue => item !== null);
}

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiContractError) {
    return 'Received an unexpected response from the server. Please try again shortly.';
  }

  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const status = error.response?.status;

  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested resource was not found.';
  if (status === 422) {
    return getValidationDetail(error) ?? 'Some submitted values are invalid. Please review and try again.';
  }
  if (status && status >= 500) return 'Server error. Please try again shortly.';

  return fallback;
}

export function isUnauthorizedError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}
