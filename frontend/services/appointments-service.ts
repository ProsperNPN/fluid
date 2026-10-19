import { apiClient } from "@/lib/api";
import {
  ensureBoolean,
  ensureNullableNumber,
  ensureNullableString,
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
    hospitalLatitude: ensureNullableNumber(
      record.hospital_latitude,
      `${context}.hospital_latitude`,
    ),
    hospitalLongitude: ensureNullableNumber(
      record.hospital_longitude,
      `${context}.hospital_longitude`,
    ),
    component: ensureString(record.component, `${context}.component`),
    endsAt: ensureNullableString(record.ends_at, `${context}.ends_at`),
    isScheduled: ensureBoolean(record.is_scheduled, `${context}.is_scheduled`),
    timezone: ensureString(record.timezone, `${context}.timezone`),
    proposedBy: ensureNullableString(
      record.proposed_by,
      `${context}.proposed_by`,
    ),
    preparationInstructions: ensureString(
      record.preparation_instructions,
      `${context}.preparation_instructions`,
    ),
    cancellationReason: ensureNullableString(
      record.cancellation_reason,
      `${context}.cancellation_reason`,
    ),
    checkedInAt: ensureNullableString(
      record.checked_in_at,
      `${context}.checked_in_at`,
    ),
    version: ensureNumber(record.version, `${context}.version`),
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
      [
        "pending",
        "confirmed",
        "checked_in",
        "completed",
        "cancelled",
        "no_show",
        "missed",
      ] as const,
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
  version?: number,
  preparationInstructions?: string,
): Promise<Appointment> {
  const response = await apiClient.patch<unknown>(
    `/api/v1/appointments/${id}/schedule`,
    {
      scheduled_at: scheduledAt,
      expected_version: version,
      preparation_instructions: preparationInstructions,
    },
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
  status: Appointment["status"],
  internalNotes?: string,
  screeningConfirmed = false,
  extra: {
    expected_version?: number;
    procedure_confirmed?: boolean;
    actual_units?: number;
    reason?: string;
  } = {},
): Promise<Appointment> {
  const response = await apiClient.patch<unknown>(
    `/api/v1/appointments/${id}/status`,
    {
      status,
      internal_notes: internalNotes,
      screening_confirmed: screeningConfirmed,
      ...extra,
    },
  );
  return parseAppointment(response.data, "appointments.status response");
}

export async function listAppointments(params: {
  scope: "donor" | "hospital";
  page: number;
  pageSize: number;
  status?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  requestId?: string;
}): Promise<AppointmentsPage> {
  const response = await apiClient.get<unknown>("/api/v1/appointments", {
    params: {
      from_date: params.fromDate,
      to_date: params.toDate,
      search: params.search,
      request_id: params.requestId,
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

export interface OpeningHours {
  weekday: number;
  start: string;
  end: string;
}
export interface AppointmentPreferences {
  timezone: string;
  hours: OpeningHours[];
}
export interface AppointmentPolicy extends AppointmentPreferences {
  enabled: boolean;
  slot_minutes: number;
  capacity: number;
  reminder_hours: number[];
  preparation_instructions: string;
}
export interface AvailableSlot {
  scheduled_at: string;
  ends_at: string;
  available_capacity: number;
  preferred: boolean;
}
export async function getAppointmentPolicy() {
  return (await apiClient.get<AppointmentPolicy>("/api/v1/appointments/policy"))
    .data;
}
export async function saveAppointmentPolicy(value: AppointmentPolicy) {
  return (
    await apiClient.put<AppointmentPolicy>("/api/v1/appointments/policy", value)
  ).data;
}
export async function getAppointmentPreferences() {
  return (
    await apiClient.get<AppointmentPreferences>(
      "/api/v1/appointments/preferences",
    )
  ).data;
}
export async function saveAppointmentPreferences(
  value: AppointmentPreferences,
) {
  return (
    await apiClient.put<AppointmentPreferences>(
      "/api/v1/appointments/preferences",
      value,
    )
  ).data;
}
export async function getAppointmentSlots(params: {
  appointmentId?: string;
  requestId?: string;
  donorUserId?: string;
  startDate: string;
}) {
  return (
    await apiClient.get<{
      items: AvailableSlot[];
      timezone: string;
      notice: string;
    }>(
      params.appointmentId
        ? `/api/v1/appointments/${params.appointmentId}/slots`
        : "/api/v1/appointments/available-slots",
      {
        params: {
          start_date: params.startDate,
          days: 7,
          request_id: params.requestId,
          donor_user_id: params.donorUserId,
        },
      },
    )
  ).data;
}
export async function createAppointment(input: {
  blood_request_id: string;
  donor_user_id: string;
  scheduled_at: string;
  preparation_instructions?: string;
}) {
  return parseAppointment(
    (await apiClient.post("/api/v1/appointments", input)).data,
    "appointments.create",
  );
}
export async function getAppointmentHistory(id: string) {
  return (
    await apiClient.get<{
      items: {
        action: string;
        version: number;
        created_at: string;
        details: { status: string; scheduled_at?: string; reason?: string };
      }[];
    }>(`/api/v1/appointments/${id}/history`)
  ).data;
}
export async function downloadAppointmentCalendar(id: string) {
  const response = await apiClient.get(`/api/v1/appointments/${id}/calendar`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fluid-appointment-${id}.ics`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
