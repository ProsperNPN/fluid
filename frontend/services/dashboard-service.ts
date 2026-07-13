import { apiClient } from '@/lib/api';
import { ensureArray, ensureEnum, ensureNumber, ensureRecord, ensureString } from '@/lib/api/contracts';

export interface DashboardMetric {
  label: string;
  value: string;
}

export interface DashboardSummary {
  role: 'admin' | 'hospital' | 'donor';
  metrics: DashboardMetric[];
  total_requests: number;
  open_requests: number;
  urgent_requests: number;
  filled_requests: number;
  total_hospitals: number;
  total_users: number;
}

function parseDashboardSummary(data: unknown, context: string): DashboardSummary {
  const record = ensureRecord(data, context);
  const metrics = ensureArray(record.metrics, `${context}.metrics`).map((item, index) => {
    const metricRecord = ensureRecord(item, `${context}.metrics[${index}]`);
    return {
      label: ensureString(metricRecord.label, `${context}.metrics[${index}].label`),
      value: ensureString(metricRecord.value, `${context}.metrics[${index}].value`),
    };
  });

  return {
    role: ensureEnum(record.role, ['admin', 'hospital', 'donor'] as const, `${context}.role`),
    metrics,
    total_requests: ensureNumber(record.total_requests, `${context}.total_requests`),
    open_requests: ensureNumber(record.open_requests, `${context}.open_requests`),
    urgent_requests: ensureNumber(record.urgent_requests, `${context}.urgent_requests`),
    filled_requests: ensureNumber(record.filled_requests, `${context}.filled_requests`),
    total_hospitals: ensureNumber(record.total_hospitals, `${context}.total_hospitals`),
    total_users: ensureNumber(record.total_users, `${context}.total_users`),
  };
}

export async function getDashboardSummary(scope: 'admin' | 'hospital' | 'donor'): Promise<DashboardSummary> {
  const response = await apiClient.get<unknown>('/api/v1/dashboard/summary', {
    params: { scope },
  });
  return parseDashboardSummary(response.data, 'dashboard.summary response');
}
