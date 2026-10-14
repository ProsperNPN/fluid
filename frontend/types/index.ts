export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type RequestStatus = 'urgent' | 'open' | 'filled';

export interface BloodRequest {
  id: string;
  hospital: string;
  bloodType: BloodType;
  units: number;
  location: string;
  postedAt: string;
  status: RequestStatus;
}

export interface DonationHistoryItem {
  id: string;
  hospital: string;
  date: string;
  bloodType: BloodType;
  status: 'completed' | 'scheduled';
}

export interface Appointment {
  id: string;
  bloodRequestId: string;
  hospitalName: string;
  donorName: string;
  bloodType: BloodType;
  scheduledAt: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'missed';
  location: string;
  units: number;
  department: string | null;
  contactPerson: string | null;
  internalNotes: string | null;
}

export interface NotificationItem {
  id: string;
  message: string;
  time: string;
  level: 'info' | 'warning' | 'success';
  type: string;
  title: string;
  isRead: boolean;
  relatedPath: string | null;
}

export interface DonorProfile {
  bloodTypeKnown: boolean;
  bloodTypeVerified: boolean;
  policyApproved: boolean;
  id: string;
  userId: string;
  bloodType: BloodType;
  city: string;
  availability: string;
  fullName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  emergencyContact: string | null;
  preferredRadiusKm: number;
  address: string | null;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  isAvailable: boolean;
  isEligible: boolean;
  lastDonationDate: string | null;
  nextEligibleDate: string | null;
  notifyUrgentRequests: boolean;
  notifyAppointments: boolean;
  notifyEligibility: boolean;
  profileCompletion: number;
}

export interface HospitalProfile {
  id: string;
  userId: string;
  hospitalName: string;
  city: string;
  address: string;
  contactPhone: string | null;
  registrationNumber: string | null;
  hospitalType: string | null;
  ownershipType: 'public' | 'private' | 'nonprofit' | null;
  region: string | null;
  country: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  officialEmail: string | null;
  website: string | null;
  emergencyContact: string | null;
  hasBloodBank: boolean;
  operatingHours: string | null;
  authorizedRepresentative: string | null;
  verificationDocumentUrl: string | null;
  verificationStatus: 'incomplete' | 'pending' | 'more_information_required' | 'verified' | 'rejected' | 'suspended';
  memberRole: string;
}
