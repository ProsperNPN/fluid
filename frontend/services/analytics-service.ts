import { apiClient } from '@/lib/api';
import { ensureNullableString, ensureNumber, ensureRecord, ensureString } from '@/lib/api/contracts';

export interface AnalyticsOverview {
  scope: string;
  total_requests: number;
  open_requests: number;
  urgent_requests: number;
  filled_requests: number;
  fill_rate_percent: number;
  urgent_rate_percent: number;
  most_requested_blood_type: string | null;
}

function parseAnalyticsOverview(data: unknown, context: string): AnalyticsOverview {
  const record = ensureRecord(data, context);

  return {
    scope: ensureString(record.scope, `${context}.scope`),
    total_requests: ensureNumber(record.total_requests, `${context}.total_requests`),
    open_requests: ensureNumber(record.open_requests, `${context}.open_requests`),
    urgent_requests: ensureNumber(record.urgent_requests, `${context}.urgent_requests`),
    filled_requests: ensureNumber(record.filled_requests, `${context}.filled_requests`),
    fill_rate_percent: ensureNumber(record.fill_rate_percent, `${context}.fill_rate_percent`),
    urgent_rate_percent: ensureNumber(record.urgent_rate_percent, `${context}.urgent_rate_percent`),
    most_requested_blood_type: ensureNullableString(record.most_requested_blood_type, `${context}.most_requested_blood_type`),
  };
}

export async function getAnalyticsOverview(scope: 'hospital' | 'admin' | 'donor'): Promise<AnalyticsOverview> {
  const response = await apiClient.get<unknown>('/api/v1/analytics/overview', {
    params: { scope },
  });
  return parseAnalyticsOverview(response.data, 'analytics.overview response');
}
