import { apiClient } from "@/lib/api";
import {
  ensureArray,
  ensureEnum,
  ensureNumber,
  ensureRecord,
  ensureString,
} from "@/lib/api/contracts";
import type { Appointment } from "@/types";

export interface AppointmentsPage {
  items: Appointment[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function parseAppointment(data: unknown, context: string): Appointment {
  const record = ensureRecord(data, context);

  return {
    id: ensureString(record.id, `${context}.id`),
    bloodRequestId: ensureString(
      record.blood_request_id,
      `${context}.blood_request_id`,
    ),
    hospitalName: ensureString(
      record.hospital_name,
      `${context}.hospital_name`,
    ),
    donorName: ensureString(record.donor_name, `${context}.donor_name`),
    bloodType: ensureEnum(
      record.blood_type,
      ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const,
      `${context}.blood_type`,
    ),
    scheduledAt: ensureString(record.scheduled_at, `${context}.scheduled_at`),
    status: ensureEnum(
      record.status,
      ["pending", "confirmed", "completed", "cancelled", "missed"] as const,
      `${context}.status`,
    ),
    location: ensureString(record.location, `${context}.location`),
    units: ensureNumber(record.units, `${context}.units`),
    department:
      record.department === null
        ? null
        : ensureString(record.department, `${context}.department`),
    contactPerson:
      record.contact_person === null
        ? null
        : ensureString(record.contact_person, `${context}.contact_person`),
    internalNotes:
      record.internal_notes === null
        ? null
        : ensureString(record.internal_notes, `${context}.internal_notes`),
  };
}

export async function scheduleAppointment(
  id: string,
  scheduledAt: string,
): Promise<Appointment> {
  const response = await apiClient.patch<unknown>(
    `/api/v1/appointments/${id}/schedule`,
    { scheduled_at: scheduledAt },
  );
  return parseAppointment(response.data, "appointments.schedule response");
}

export async function cancelAppointment(id: string): Promise<Appointment> {
  const response = await apiClient.patch<unknown>(
    `/api/v1/appointments/${id}/cancel`,
  );
  return parseAppointment(response.data, "appointments.cancel response");
}

export async function updateAppointmentStatus(
  id: string,
  status: "confirmed" | "completed" | "cancelled" | "missed",
  internalNotes?: string,
  screeningConfirmed = false,
): Promise<Appointment> {
  const response = await apiClient.patch<unknown>(
    `/api/v1/appointments/${id}/status`,
    {
      status,
      internal_notes: internalNotes,
      screening_confirmed: screeningConfirmed,
    },
  );
  return parseAppointment(response.data, "appointments.status response");
}

export async function listAppointments(params: {
  scope: "donor" | "hospital";
  page: number;
  pageSize: number;
  status?: string;
}): Promise<AppointmentsPage> {
  const response = await apiClient.get<unknown>("/api/v1/appointments", {
    params: {
      scope: params.scope,
      status: params.status,
      page: params.page,
      page_size: params.pageSize,
    },
  });

  const record = ensureRecord(response.data, "appointments.list response");
  const rows = ensureArray(record.items, "appointments.list response.items");

  return {
    items: rows.map((row, index) =>
      parseAppointment(row, `appointments.list response.items[${index}]`),
    ),
    page: ensureNumber(record.page, "appointments.list response.page"),
    pageSize: ensureNumber(
      record.page_size,
      "appointments.list response.page_size",
    ),
    total: ensureNumber(record.total, "appointments.list response.total"),
    totalPages: ensureNumber(
      record.total_pages,
      "appointments.list response.total_pages",
    ),
  };
}

export async function downloadDonationConfirmation(id: string) {
  const response = await apiClient.get(
    `/api/v1/appointments/${id}/confirmation`,
    { responseType: "blob" },
  );
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fluid-donation-${id}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
