export class ApiContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiContractError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function ensureRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ApiContractError(`Invalid ${context}: expected object.`);
  }
  return value;
}

export function ensureArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ApiContractError(`Invalid ${context}: expected array.`);
  }
  return value;
}

export function ensureString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new ApiContractError(`Invalid ${context}: expected string.`);
  }
  return value;
}

export function ensureNullableString(value: unknown, context: string): string | null {
  if (value === null || typeof value === 'string') {
    return value;
  }
  throw new ApiContractError(`Invalid ${context}: expected string or null.`);
}

export function ensureBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ApiContractError(`Invalid ${context}: expected boolean.`);
  }
  return value;
}

export function ensureNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ApiContractError(`Invalid ${context}: expected number.`);
  }
  return value;
}

export function ensureNullableNumber(value: unknown, context: string): number | null {
  if (value === null || (typeof value === 'number' && !Number.isNaN(value))) return value;
  throw new ApiContractError(`Invalid ${context}: expected number or null.`);
}

export function ensureEnum<T extends string>(value: unknown, allowed: readonly T[], context: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ApiContractError(`Invalid ${context}: unexpected value.`);
  }
  return value as T;
}
