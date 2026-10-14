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

export type HospitalRequestStatus =
  | "draft"
  | "published"
  | "partially_fulfilled"
  | "fulfilled"
  | "cancelled"
  | "expired";
export interface HospitalRequest {
  id: string;
  hospitalName: string;
  hospitalVerified: boolean;
  bloodType: BloodType;
  component: string;
  units: number;
  unitsFulfilled: number;
  urgency: "routine" | "urgent" | "critical";
  patientCategory: string | null;
  requiredBy: string | null;
  expiresAt: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  department: string | null;
  contactPerson: string | null;
  notes: string | null;
  appointmentAvailable: boolean;
  visibility: string;
  status: HospitalRequestStatus;
  isArchived: boolean;
  createdAt: string;
  donorResponseCount: number;
  appointmentCount: number;
}
export interface HospitalRequestInput {
  bloodType: BloodType;
  component: string;
  units: number;
  urgency: HospitalRequest["urgency"];
  patientCategory: string | null;
  requiredBy: string | null;
  expiresAt: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  department: string | null;
  contactPerson: string | null;
  notes: string | null;
  appointmentAvailable: boolean;
  visibility: "matched" | "regional";
  status: "draft" | "published";
}
function parse(data: unknown, context: string): HospitalRequest {
  const row = ensureRecord(data, context);
  return {
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
    component: ensureString(row.component, `${context}.component`),
    units: ensureNumber(row.units, `${context}.units`),
    unitsFulfilled: ensureNumber(
      row.units_fulfilled,
      `${context}.units_fulfilled`,
    ),
    urgency: ensureString(
      row.urgency,
      `${context}.urgency`,
    ) as HospitalRequest["urgency"],
    patientCategory: ensureNullableString(
      row.patient_category,
      `${context}.patient_category`,
    ),
    requiredBy: ensureNullableString(row.required_by, `${context}.required_by`),
    expiresAt: ensureNullableString(row.expires_at, `${context}.expires_at`),
    location: ensureString(row.location, `${context}.location`),
    latitude: ensureNullableNumber(row.latitude, `${context}.latitude`),
    longitude: ensureNullableNumber(row.longitude, `${context}.longitude`),
    department: ensureNullableString(row.department, `${context}.department`),
    contactPerson: ensureNullableString(
      row.contact_person,
      `${context}.contact_person`,
    ),
    notes: ensureNullableString(row.notes, `${context}.notes`),
    appointmentAvailable: ensureBoolean(
      row.appointment_available,
      `${context}.appointment_available`,
    ),
    visibility: ensureString(row.visibility, `${context}.visibility`),
    status: ensureString(
      row.status,
      `${context}.status`,
    ) as HospitalRequestStatus,
    isArchived: ensureBoolean(row.is_archived, `${context}.is_archived`),
    createdAt: ensureString(row.created_at, `${context}.created_at`),
    donorResponseCount: ensureNumber(
      row.donor_response_count,
      `${context}.donor_response_count`,
    ),
    appointmentCount: ensureNumber(
      row.appointment_count,
      `${context}.appointment_count`,
    ),
  };
}
function payload(input: HospitalRequestInput) {
  return {
    blood_type: input.bloodType,
    component: input.component,
    units: input.units,
    urgency: input.urgency,
    patient_category: input.patientCategory,
    required_by: input.requiredBy,
    expires_at: input.expiresAt,
    location: input.location,
    latitude: input.latitude,
    longitude: input.longitude,
    department: input.department,
    contact_person: input.contactPerson,
    notes: input.notes,
    appointment_available: input.appointmentAvailable,
    visibility: input.visibility,
    status: input.status,
  };
}
export async function listHospitalRequests(params: {
  page: number;
  status?: string;
  search?: string;
}) {
  const response = await apiClient.get<unknown>("/api/v1/blood-requests/page", {
    params: {
      mine: true,
      page: params.page,
      page_size: 10,
      status: params.status,
      search: params.search,
    },
  });
  const row = ensureRecord(response.data, "hospital requests");
  return {
    items: ensureArray(row.items, "hospital requests.items").map(
      (item, index) => parse(item, `hospital requests.items[${index}]`),
    ),
    total: ensureNumber(row.total, "hospital requests.total"),
    totalPages: ensureNumber(row.total_pages, "hospital requests.total_pages"),
  };
}
export async function createHospitalRequest(input: HospitalRequestInput) {
  const response = await apiClient.post<unknown>(
    "/api/v1/blood-requests",
    payload(input),
  );
  return parse(response.data, "hospital request create");
}
export async function publishHospitalRequest(id: string) {
  const response = await apiClient.post<unknown>(
    `/api/v1/blood-requests/${id}/publish`,
  );
  return parse(response.data, "hospital request publish");
}
export async function cancelHospitalRequest(id: string) {
  const response = await apiClient.post<unknown>(
    `/api/v1/blood-requests/${id}/cancel`,
  );
  return parse(response.data, "hospital request cancel");
}

export async function updateHospitalRequest(
  id: string,
  input: HospitalRequestInput,
) {
  const response = await apiClient.put(`/api/v1/blood-requests/${id}`, {
    ...payload(input),
    status: "draft",
  });
  return parse(response.data, "request update");
}
export async function transitionHospitalRequest(
  id: string,
  input: {
    action: "prioritize" | "fulfill" | "close";
    urgency?: string;
    confirmed_units?: number;
    reason: string;
    record_confirmed?: boolean;
  },
) {
  const response = await apiClient.post(
    `/api/v1/blood-requests/${id}/transition`,
    input,
  );
  return parse(response.data, "request transition");
}
