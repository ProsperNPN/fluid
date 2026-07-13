import { apiClient } from '@/lib/api';
import { ensureArray, ensureEnum, ensureNumber, ensureRecord, ensureString } from '@/lib/api/contracts';
import type { BloodRequest, BloodType, RequestStatus } from '@/types';

interface BloodRequestApiItem {
  id: string;
  hospital_name: string;
  blood_type: BloodType;
  units: number;
  location: string;
  status: RequestStatus;
  created_at: string;
}

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const requestStatuses = ['urgent', 'open', 'filled'] as const;

export interface BloodRequestsPage {
  items: BloodRequest[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function mapBloodRequest(item: BloodRequestApiItem): BloodRequest {
  return {
    id: item.id,
    hospital: item.hospital_name,
    bloodType: item.blood_type,
    units: item.units,
    location: item.location,
    postedAt: formatRelativeTime(item.created_at),
    status: item.status,
  };
}

function parseBloodRequest(item: unknown, context: string): BloodRequestApiItem {
  const record = ensureRecord(item, context);

  return {
    id: ensureString(record.id, `${context}.id`),
    hospital_name: ensureString(record.hospital_name, `${context}.hospital_name`),
    blood_type: ensureEnum(record.blood_type, bloodTypes, `${context}.blood_type`),
    units: ensureNumber(record.units, `${context}.units`),
    location: ensureString(record.location, `${context}.location`),
    status: ensureEnum(record.status, requestStatuses, `${context}.status`),
    created_at: ensureString(record.created_at, `${context}.created_at`),
  };
}

export async function listBloodRequests(mine = false): Promise<BloodRequest[]> {
  const response = await apiClient.get<unknown>('/api/v1/blood-requests', {
    params: { mine },
  });
  const rows = ensureArray(response.data, 'blood-requests.list response');
  return rows.map((row, index) => mapBloodRequest(parseBloodRequest(row, `blood-requests.list response[${index}]`)));
}

export async function listBloodRequestsPage(params: { mine?: boolean; page: number; pageSize: number }): Promise<BloodRequestsPage> {
  const response = await apiClient.get<unknown>('/api/v1/blood-requests/page', {
    params: {
      mine: params.mine ?? false,
      page: params.page,
      page_size: params.pageSize,
    },
  });

  const record = ensureRecord(response.data, 'blood-requests.page response');
  const rows = ensureArray(record.items, 'blood-requests.page response.items');

  return {
    items: rows.map((row, index) => mapBloodRequest(parseBloodRequest(row, `blood-requests.page response.items[${index}]`))),
    page: ensureNumber(record.page, 'blood-requests.page response.page'),
    pageSize: ensureNumber(record.page_size, 'blood-requests.page response.page_size'),
    total: ensureNumber(record.total, 'blood-requests.page response.total'),
    totalPages: ensureNumber(record.total_pages, 'blood-requests.page response.total_pages'),
  };
}

export async function createBloodRequest(payload: {
  bloodType: BloodType;
  units: number;
  location: string;
  status?: RequestStatus;
}): Promise<BloodRequest> {
  const response = await apiClient.post<unknown>('/api/v1/blood-requests', {
    blood_type: payload.bloodType,
    units: payload.units,
    location: payload.location,
    status: payload.status ?? 'open',
  });
  return mapBloodRequest(parseBloodRequest(response.data, 'blood-requests.create response'));
}
