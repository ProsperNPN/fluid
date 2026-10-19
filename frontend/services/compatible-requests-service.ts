import { apiClient } from "@/lib/api";
import {
  ensureArray,
  ensureBoolean,
  ensureNullableNumber,
  ensureNullableString,
  ensureNumber,
  ensureRecord,
  ensureString,
} from "@/lib/api/contracts";
import type { BloodType } from "@/types";

export interface CompatibleRequest {
  hospitalLatitude: number | null;
  hospitalLongitude: number | null;
  canAccept: boolean;
  component: string;
  urgency: string;
  requiredBy: string | null;
  id: string;
  hospitalName: string;
  hospitalVerified: boolean;
  bloodType: BloodType;
  units: number;
  location: string;
  status: string;
  notes: string | null;
  distanceKm: number | null;
  createdAt: string;
  expiresAt: string | null;
  responseStatus: string | null;
}
function parse(data: unknown, context: string): CompatibleRequest {
  const row = ensureRecord(data, context);
  return {
    hospitalLatitude: ensureNullableNumber(
      row.hospital_latitude,
      `${context}.hospital_latitude`,
    ),
    hospitalLongitude: ensureNullableNumber(
      row.hospital_longitude,
      `${context}.hospital_longitude`,
    ),
    canAccept: ensureBoolean(row.can_accept, `${context}.can_accept`),
    component: ensureString(row.component, "component"),
    urgency: ensureString(row.urgency, "urgency"),
    requiredBy: ensureNullableString(row.required_by, "required by"),
    id: ensureString(row.id, `${context}.id`),
    hospitalName: ensureString(row.hospital_name, `${context}.hospital_name`),
    hospitalVerified: ensureBoolean(
      row.hospital_verified,
      `${context}.hospital_verified`,
    ),
    bloodType: ensureString(
      row.blood_type,
      `${context}.blood_type`,
    ) as BloodType,
    units: ensureNumber(row.units, `${context}.units`),
    location: ensureString(row.location, `${context}.location`),
    status: ensureString(row.status, `${context}.status`),
    notes: ensureNullableString(row.notes, `${context}.notes`),
    distanceKm: ensureNullableNumber(row.distance_km, `${context}.distance_km`),
    createdAt: ensureString(row.created_at, `${context}.created_at`),
    expiresAt: ensureNullableString(row.expires_at, `${context}.expires_at`),
    responseStatus: ensureNullableString(
      row.response_status,
      `${context}.response_status`,
    ),
  };
}
export async function listCompatibleRequests(
  params: {
    page?: number;
    pageSize?: number;
    urgency?: string;
    search?: string;
    requestId?: string;
  } = {},
) {
  const response = await apiClient.get<unknown>(
    "/api/v1/donor-matches/compatible",
    {
      params: {
        page: params.page ?? 1,
        page_size: params.pageSize ?? 10,
        urgency: params.urgency,
        search: params.search,
        request_id: params.requestId,
      },
    },
  );
  const row = ensureRecord(response.data, "compatible requests");
  return {
    items: ensureArray(row.items, "compatible requests.items").map(
      (item, index) => parse(item, `compatible requests.items[${index}]`),
    ),
    total: ensureNumber(row.total, "compatible requests.total"),
    totalPages: ensureNumber(
      row.total_pages,
      "compatible requests.total_pages",
    ),
  };
}
export async function respondToRequest(
  id: string,
  status: "accepted" | "declined" | "saved",
) {
  const response = await apiClient.post<unknown>(
    `/api/v1/donor-matches/${id}/responses/${status}`,
  );
  return parse(response.data, "compatible request response");
}

export async function listDonorInvitations(page = 1) {
  const response = await apiClient.get("/api/v1/donor-matches/invitations", {
    params: { page, page_size: 10 },
  });
  const row = ensureRecord(response.data, "donor invitations");
  return {
    items: ensureArray(row.items, "invitations.items").map((v, i) =>
      parse(v, `invitations[${i}]`),
    ),
    total: ensureNumber(row.total, "invitations.total"),
    totalPages: ensureNumber(row.total_pages, "invitations.pages"),
  };
}
