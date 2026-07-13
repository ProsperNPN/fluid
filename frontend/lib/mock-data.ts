import type { Appointment, BloodRequest, DonationHistoryItem, NotificationItem } from '@/types';

export const donorOverview = [
  { label: 'Total Donations', value: '12' },
  { label: 'Lives Impacted', value: '36' },
  { label: 'Eligible Again In', value: '18 days' },
  { label: 'Response Rate', value: '92%' }
];

export const donorRequests: BloodRequest[] = [
  { id: 'REQ-104', hospital: 'City General', bloodType: 'O+', units: 2, location: 'Accra', postedAt: '10m ago', status: 'urgent' },
  { id: 'REQ-098', hospital: 'Hope Medical Center', bloodType: 'O+', units: 1, location: 'Tema', postedAt: '1h ago', status: 'open' }
];

export const donationHistory: DonationHistoryItem[] = [
  { id: 'DON-001', hospital: 'Saint Mary Hospital', date: '2026-06-20', bloodType: 'O+', status: 'completed' },
  { id: 'DON-002', hospital: 'North Care Clinic', date: '2026-04-13', bloodType: 'O+', status: 'completed' }
];

export const donorAppointments: Appointment[] = [
  { id: 'APT-01', bloodRequestId: 'REQ-104', hospitalName: 'City General', donorName: 'Donor', bloodType: 'O+', scheduledAt: '2026-07-11T10:30:00Z', status: 'confirmed', location: 'City General', units: 1, department: null, contactPerson: null, internalNotes: null }
];

export const donorNotifications: NotificationItem[] = [
  { id: 'N-1', type: 'request', title: 'Urgent request', message: 'Urgent O+ request near your location.', time: '5m ago', level: 'warning', isRead: false, relatedPath: null },
  { id: 'N-2', type: 'appointment', title: 'Appointment reminder', message: 'Appointment reminder for July 11.', time: '1h ago', level: 'info', isRead: true, relatedPath: null }
];

export const hospitalOverview = [
  { label: 'Active Requests', value: '7' },
  { label: 'Matched Donors', value: '23' },
  { label: 'Completed Donations', value: '54' },
  { label: 'Avg Fulfillment', value: '2.4h' }
];

export const hospitalRequests: BloodRequest[] = [
  { id: 'REQ-201', hospital: 'Your Hospital', bloodType: 'A-', units: 3, location: 'Accra', postedAt: '20m ago', status: 'urgent' },
  { id: 'REQ-187', hospital: 'Your Hospital', bloodType: 'B+', units: 2, location: 'Accra', postedAt: '3h ago', status: 'open' }
];

export const hospitalDonorResponses = [
  { donor: 'Ama K.', bloodType: 'A-', response: 'Accepted', eta: '40 min' },
  { donor: 'Kojo T.', bloodType: 'B+', response: 'Pending', eta: '-' }
];

export const hospitalAppointments: Appointment[] = [
  { id: 'H-APT-1', bloodRequestId: 'REQ-201', hospitalName: 'Your Hospital', donorName: 'Ama K.', bloodType: 'A-', scheduledAt: '2026-07-08T14:00:00Z', status: 'confirmed', location: 'Unit 4, Donation Wing', units: 1, department: null, contactPerson: null, internalNotes: null }
];

export const adminOverview = [
  { label: 'Pending Verifications', value: '9' },
  { label: 'Total Donors', value: '12,402' },
  { label: 'Total Hospitals', value: '186' },
  { label: 'Open Requests', value: '71' }
];

export const pendingHospitals = [
  { name: 'Mercy West Hospital', city: 'Kumasi', submitted: '2026-07-06' },
  { name: 'Sunrise Trauma Center', city: 'Takoradi', submitted: '2026-07-05' }
];

export const platformActivity = [
  { event: 'Request REQ-201 created', time: '12m ago', actor: 'Your Hospital' },
  { event: 'Donation DON-723 completed', time: '26m ago', actor: 'Donor #D-9832' }
];
