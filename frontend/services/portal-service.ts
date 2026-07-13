import { apiClient } from '@/lib/api';
import { ensureArray, ensureEnum, ensureRecord, ensureString } from '@/lib/api/contracts';
import type { DonationHistoryItem } from '@/types';

export interface HospitalDonorResponseItem {
  donor: string;
  bloodType: string;
  response: string;
  eta: string;
}

export interface PendingHospitalItem {
  name: string;
  city: string;
  submitted: string;
}

export interface PlatformActivityItem {
  event: string;
  actor: string;
  time: string;
}

interface DonorAppointmentApiItem {
  id: string;
  title: string;
  date: string;
  location: string;
}

interface DonationHistoryApiItem {
  id: string;
  hospital: string;
  date: string;
  blood_type: DonationHistoryItem['bloodType'];
  status: 'completed' | 'scheduled';
}

interface HospitalDonorResponseApiItem {
  donor: string;
  blood_type: string;
  response: string;
  eta: string;
}

interface DonorPortalDataApi {
  donation_history: DonationHistoryApiItem[];
  appointments: DonorAppointmentApiItem[];
}

interface HospitalPortalDataApi {
  donor_responses: HospitalDonorResponseApiItem[];
  appointments: DonorAppointmentApiItem[];
}

interface AdminPortalDataApi {
  pending_hospitals: PendingHospitalItem[];
  platform_activity: PlatformActivityItem[];
}

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const donationStatuses = ['completed', 'scheduled'] as const;

export interface DonorPortalData {
  donationHistory: DonationHistoryItem[];
  appointments: DonorAppointmentApiItem[];
}

export interface HospitalPortalData {
  donorResponses: HospitalDonorResponseItem[];
  appointments: DonorAppointmentApiItem[];
}

export interface AdminPortalData {
  pendingHospitals: PendingHospitalItem[];
  platformActivity: PlatformActivityItem[];
}

function mapAppointment(item: DonorAppointmentApiItem): DonorAppointmentApiItem {
  return {
    id: item.id,
    title: item.title,
    date: item.date,
    location: item.location,
  };
}

function parseDonorAppointment(item: unknown, context: string): DonorAppointmentApiItem {
  const record = ensureRecord(item, context);
  return {
    id: ensureString(record.id, `${context}.id`),
    title: ensureString(record.title, `${context}.title`),
    date: ensureString(record.date, `${context}.date`),
    location: ensureString(record.location, `${context}.location`),
  };
}

function parseDonationHistory(item: unknown, context: string): DonationHistoryApiItem {
  const record = ensureRecord(item, context);
  return {
    id: ensureString(record.id, `${context}.id`),
    hospital: ensureString(record.hospital, `${context}.hospital`),
    date: ensureString(record.date, `${context}.date`),
    blood_type: ensureEnum(record.blood_type, bloodTypes, `${context}.blood_type`),
    status: ensureEnum(record.status, donationStatuses, `${context}.status`),
  };
}

function parseHospitalDonorResponse(item: unknown, context: string): HospitalDonorResponseApiItem {
  const record = ensureRecord(item, context);
  return {
    donor: ensureString(record.donor, `${context}.donor`),
    blood_type: ensureString(record.blood_type, `${context}.blood_type`),
    response: ensureString(record.response, `${context}.response`),
    eta: ensureString(record.eta, `${context}.eta`),
  };
}

function parsePendingHospital(item: unknown, context: string): PendingHospitalItem {
  const record = ensureRecord(item, context);
  return {
    name: ensureString(record.name, `${context}.name`),
    city: ensureString(record.city, `${context}.city`),
    submitted: ensureString(record.submitted, `${context}.submitted`),
  };
}

function parsePlatformActivity(item: unknown, context: string): PlatformActivityItem {
  const record = ensureRecord(item, context);
  return {
    event: ensureString(record.event, `${context}.event`),
    actor: ensureString(record.actor, `${context}.actor`),
    time: ensureString(record.time, `${context}.time`),
  };
}

export async function getDonorPortalData(): Promise<DonorPortalData> {
  const response = await apiClient.get<unknown>('/api/v1/portal/donor-data');
  const record = ensureRecord(response.data, 'portal.donor response');
  const donationHistoryRows = ensureArray(record.donation_history, 'portal.donor response.donation_history');
  const appointmentRows = ensureArray(record.appointments, 'portal.donor response.appointments');

  return {
    donationHistory: donationHistoryRows.map((item, index) => {
      const row = parseDonationHistory(item, `portal.donor response.donation_history[${index}]`);

      return {
        id: row.id,
        hospital: row.hospital,
        date: row.date,
        bloodType: row.blood_type,
        status: row.status,
      };
    }),
    appointments: appointmentRows.map((item, index) => mapAppointment(parseDonorAppointment(item, `portal.donor response.appointments[${index}]`))),
  };
}

export async function getHospitalPortalData(): Promise<HospitalPortalData> {
  const response = await apiClient.get<unknown>('/api/v1/portal/hospital-data');
  const record = ensureRecord(response.data, 'portal.hospital response');
  const donorResponseRows = ensureArray(record.donor_responses, 'portal.hospital response.donor_responses');
  const appointmentRows = ensureArray(record.appointments, 'portal.hospital response.appointments');

  return {
    donorResponses: donorResponseRows.map((item, index) => {
      const row = parseHospitalDonorResponse(item, `portal.hospital response.donor_responses[${index}]`);
      return {
        donor: row.donor,
        bloodType: row.blood_type,
        response: row.response,
        eta: row.eta,
      };
    }),
    appointments: appointmentRows.map((item, index) => mapAppointment(parseDonorAppointment(item, `portal.hospital response.appointments[${index}]`))),
  };
}

export async function getAdminPortalData(): Promise<AdminPortalData> {
  const response = await apiClient.get<unknown>('/api/v1/portal/admin-data');
  const record = ensureRecord(response.data, 'portal.admin response');
  const pendingRows = ensureArray(record.pending_hospitals, 'portal.admin response.pending_hospitals');
  const activityRows = ensureArray(record.platform_activity, 'portal.admin response.platform_activity');

  return {
    pendingHospitals: pendingRows.map((item, index) => parsePendingHospital(item, `portal.admin response.pending_hospitals[${index}]`)),
    platformActivity: activityRows.map((item, index) => parsePlatformActivity(item, `portal.admin response.platform_activity[${index}]`)),
  };
}
