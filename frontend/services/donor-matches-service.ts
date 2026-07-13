import { apiClient } from '@/lib/api';
import { ensureArray, ensureNumber, ensureRecord, ensureString } from '@/lib/api/contracts';

export interface DonorMatchItem {
  id: string;
  donor: string;
  bloodType: string;
  response: string;
  eta: string;
}

export interface DonorMatchesPage {
  items: DonorMatchItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function parseDonorMatch(data: unknown, context: string): DonorMatchItem {
  const record = ensureRecord(data, context);
  return {
    id: ensureString(record.id, `${context}.id`),
    donor: ensureString(record.donor, `${context}.donor`),
    bloodType: ensureString(record.blood_type, `${context}.blood_type`),
    response: ensureString(record.response, `${context}.response`),
    eta: ensureString(record.eta, `${context}.eta`),
  };
}

export async function listDonorMatches(params: { page: number; pageSize: number }): Promise<DonorMatchesPage> {
  const response = await apiClient.get<unknown>('/api/v1/donor-matches', {
    params: {
      page: params.page,
      page_size: params.pageSize,
    },
  });

  const record = ensureRecord(response.data, 'donor-matches.list response');
  const rows = ensureArray(record.items, 'donor-matches.list response.items');

  return {
    items: rows.map((row, index) => parseDonorMatch(row, `donor-matches.list response.items[${index}]`)),
    page: ensureNumber(record.page, 'donor-matches.list response.page'),
    pageSize: ensureNumber(record.page_size, 'donor-matches.list response.page_size'),
    total: ensureNumber(record.total, 'donor-matches.list response.total'),
    totalPages: ensureNumber(record.total_pages, 'donor-matches.list response.total_pages'),
  };
}
