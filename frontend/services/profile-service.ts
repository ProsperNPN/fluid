import { apiClient } from '@/lib/api';
import { ensureBoolean, ensureEnum, ensureNullableNumber, ensureNullableString, ensureNumber, ensureRecord, ensureString } from '@/lib/api/contracts';
import type { DonorProfile, HospitalProfile } from '@/types';

const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

function parseDonorProfile(data: unknown, context: string): DonorProfile {
  const record = ensureRecord(data, context);

  return {
    id: ensureString(record.id, `${context}.id`),
    userId: ensureString(record.user_id, `${context}.user_id`),
    bloodType: ensureEnum(record.blood_type, bloodTypes, `${context}.blood_type`),
    city: ensureString(record.city, `${context}.city`),
    availability: ensureString(record.availability, `${context}.availability`),
    fullName: ensureNullableString(record.full_name, `${context}.full_name`) ?? '',
    email: ensureString(record.email, `${context}.email`),
    phone: ensureNullableString(record.phone, `${context}.phone`),
    dateOfBirth: ensureNullableString(record.date_of_birth, `${context}.date_of_birth`),
    gender: ensureNullableString(record.gender, `${context}.gender`),
    emergencyContact: ensureNullableString(record.emergency_contact, `${context}.emergency_contact`),
    preferredRadiusKm: ensureNumber(record.preferred_radius_km, `${context}.preferred_radius_km`),
    address: ensureNullableString(record.address, `${context}.address`),
    region: ensureNullableString(record.region, `${context}.region`),
    country: ensureString(record.country, `${context}.country`),
    latitude: ensureNullableNumber(record.latitude, `${context}.latitude`),
    longitude: ensureNullableNumber(record.longitude, `${context}.longitude`),
    isAvailable: ensureBoolean(record.is_available, `${context}.is_available`),
    isEligible: ensureBoolean(record.is_eligible, `${context}.is_eligible`),
    lastDonationDate: ensureNullableString(record.last_donation_date, `${context}.last_donation_date`),
    nextEligibleDate: ensureNullableString(record.next_eligible_date, `${context}.next_eligible_date`),
    notifyUrgentRequests: ensureBoolean(record.notify_urgent_requests, `${context}.notify_urgent_requests`),
    notifyAppointments: ensureBoolean(record.notify_appointments, `${context}.notify_appointments`),
    notifyEligibility: ensureBoolean(record.notify_eligibility, `${context}.notify_eligibility`),
    profileCompletion: ensureNumber(record.profile_completion, `${context}.profile_completion`),
  };
}

function parseHospitalProfile(data: unknown, context: string): HospitalProfile {
  const record = ensureRecord(data, context);

  return {
    id: ensureString(record.id, `${context}.id`),
    userId: ensureString(record.user_id, `${context}.user_id`),
    hospitalName: ensureString(record.hospital_name, `${context}.hospital_name`),
    city: ensureString(record.city, `${context}.city`),
    address: ensureString(record.address, `${context}.address`),
    contactPhone: ensureNullableString(record.contact_phone, `${context}.contact_phone`),
    registrationNumber: ensureNullableString(record.registration_number, `${context}.registration_number`),
    hospitalType: ensureNullableString(record.hospital_type, `${context}.hospital_type`),
    ownershipType: ensureNullableString(record.ownership_type, `${context}.ownership_type`) as HospitalProfile['ownershipType'],
    region: ensureNullableString(record.region, `${context}.region`),
    country: ensureString(record.country, `${context}.country`),
    latitude: ensureNullableNumber(record.latitude, `${context}.latitude`),
    longitude: ensureNullableNumber(record.longitude, `${context}.longitude`),
    officialEmail: ensureNullableString(record.official_email, `${context}.official_email`),
    website: ensureNullableString(record.website, `${context}.website`),
    emergencyContact: ensureNullableString(record.emergency_contact, `${context}.emergency_contact`),
    hasBloodBank: ensureBoolean(record.has_blood_bank, `${context}.has_blood_bank`),
    operatingHours: ensureNullableString(record.operating_hours, `${context}.operating_hours`),
    authorizedRepresentative: ensureNullableString(record.authorized_representative, `${context}.authorized_representative`),
    verificationDocumentUrl: ensureNullableString(record.verification_document_url, `${context}.verification_document_url`),
    verificationStatus: ensureEnum(record.verification_status, ['pending', 'verified', 'rejected', 'suspended'] as const, `${context}.verification_status`),
    memberRole: ensureString(record.member_role, `${context}.member_role`),
  };
}

export async function getDonorProfile(): Promise<DonorProfile> {
  const response = await apiClient.get<unknown>('/api/v1/profiles/donor/me');
  return parseDonorProfile(response.data, 'profiles.donor.get response');
}

export async function updateDonorProfile(payload: DonorProfile): Promise<DonorProfile> {
  const response = await apiClient.put<unknown>('/api/v1/profiles/donor/me', {
    blood_type: payload.bloodType,
    full_name: payload.fullName,
    phone: payload.phone,
    date_of_birth: payload.dateOfBirth,
    gender: payload.gender,
    emergency_contact: payload.emergencyContact,
    preferred_radius_km: payload.preferredRadiusKm,
    address: payload.address,
    city: payload.city,
    region: payload.region,
    country: payload.country,
    latitude: payload.latitude,
    longitude: payload.longitude,
    is_available: payload.isAvailable,
    is_eligible: payload.isEligible,
    last_donation_date: payload.lastDonationDate,
    notify_urgent_requests: payload.notifyUrgentRequests,
    notify_appointments: payload.notifyAppointments,
    notify_eligibility: payload.notifyEligibility,
  });
  return parseDonorProfile(response.data, 'profiles.donor.update response');
}

export async function updateDonorAvailability(isAvailable: boolean): Promise<DonorProfile> {
  const response = await apiClient.patch<unknown>('/api/v1/profiles/donor/me/availability', { is_available: isAvailable });
  return parseDonorProfile(response.data, 'profiles.donor.availability response');
}

export async function updateDonorLocation(payload: Pick<DonorProfile, 'city' | 'address' | 'region' | 'country' | 'latitude' | 'longitude'>): Promise<DonorProfile> {
  const response = await apiClient.patch<unknown>('/api/v1/profiles/donor/me/location', {
    city: payload.city, address: payload.address, region: payload.region, country: payload.country,
    latitude: payload.latitude, longitude: payload.longitude,
  });
  return parseDonorProfile(response.data, 'profiles.donor.location response');
}

export async function getHospitalProfile(): Promise<HospitalProfile> {
  const response = await apiClient.get<unknown>('/api/v1/profiles/hospital/me');
  return parseHospitalProfile(response.data, 'profiles.hospital.get response');
}

export async function updateHospitalProfile(payload: HospitalProfile): Promise<HospitalProfile> {
  const response = await apiClient.put<unknown>('/api/v1/profiles/hospital/me', {
    hospital_name: payload.hospitalName,
    city: payload.city,
    address: payload.address,
    contact_phone: payload.contactPhone,
    registration_number: payload.registrationNumber,
    hospital_type: payload.hospitalType,
    ownership_type: payload.ownershipType,
    region: payload.region,
    country: payload.country,
    latitude: payload.latitude,
    longitude: payload.longitude,
    official_email: payload.officialEmail,
    website: payload.website,
    emergency_contact: payload.emergencyContact,
    has_blood_bank: payload.hasBloodBank,
    operating_hours: payload.operatingHours,
    authorized_representative: payload.authorizedRepresentative,
    verification_document_url: payload.verificationDocumentUrl,
  });
  return parseHospitalProfile(response.data, 'profiles.hospital.update response');
}
