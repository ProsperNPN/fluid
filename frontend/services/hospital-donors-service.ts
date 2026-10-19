import { apiClient } from "@/lib/api";
import {
  ensureArray,
  ensureNullableNumber,
  ensureNullableString,
  ensureNumber,
  ensureRecord,
  ensureString,
} from "@/lib/api/contracts";
export interface HospitalDonorResponse {
  id: string;
  donorUserId: string | null;
  donor: string;
  bloodType: string;
  response: string;
  eta: string;
  requestId: string | null;
  compatibility: string | null;
  availability: string | null;
  approximateLocation: string | null;
  distanceKm: number | null;
  lastDonationDate: string | null;
  eligibilityStatus: string | null;
  responseStatus: string | null;
  respondedAt: string | null;
}
function parse(data: unknown, context: string): HospitalDonorResponse {
  const row = ensureRecord(data, context);
  return {
    id: ensureString(row.id, `${context}.id`),
    donorUserId: ensureNullableString(
      row.donor_user_id,
      `${context}.donor_user_id`,
    ),
    donor: ensureString(row.donor, `${context}.donor`),
    bloodType: ensureString(row.blood_type, `${context}.blood_type`),
    response: ensureString(row.response, `${context}.response`),
    eta: ensureString(row.eta, `${context}.eta`),
    requestId: ensureNullableString(row.request_id, `${context}.request_id`),
    compatibility: ensureNullableString(
      row.compatibility,
      `${context}.compatibility`,
    ),
    availability: ensureNullableString(
      row.availability,
      `${context}.availability`,
    ),
    approximateLocation: ensureNullableString(
      row.approximate_location,
      `${context}.approximate_location`,
    ),
    distanceKm: ensureNullableNumber(row.distance_km, `${context}.distance_km`),
    lastDonationDate: ensureNullableString(
      row.last_donation_date,
      `${context}.last_donation_date`,
    ),
    eligibilityStatus: ensureNullableString(
      row.eligibility_status,
      `${context}.eligibility_status`,
    ),
    responseStatus: ensureNullableString(
      row.response_status,
      `${context}.response_status`,
    ),
    respondedAt: ensureNullableString(
      row.responded_at,
      `${context}.responded_at`,
    ),
  };
}
export async function listHospitalDonorResponses(page = 1) {
  const response = await apiClient.get<unknown>("/api/v1/donor-matches", {
    params: { page, page_size: 50 },
  });
  const row = ensureRecord(response.data, "hospital donor responses");
  return {
    items: ensureArray(row.items, "hospital donor responses.items").map(
      (v, i) => parse(v, `hospital donor responses.items[${i}]`),
    ),
    total: ensureNumber(row.total, "hospital donor responses.total"),
    totalPages: ensureNumber(
      row.total_pages,
      "hospital donor responses.total_pages",
    ),
  };
}
export async function decideHospitalDonorResponse(
  id: string,
  decision: "accept" | "reject",
) {
  const response = await apiClient.post<unknown>(
    `/api/v1/donor-matches/responses/${id}/${decision}`,
  );
  return parse(response.data, "hospital donor response decision");
}

export interface PotentialDonor {
  donor_user_id: string;
  donor: string;
  blood_type: string;
  distance_km: number;
  approximate_location: string;
  response_status: string | null;
  eligibility_status: string;
  availability: string;
  priority: string;
  priority_score: number;
  compatibility: string;
  explanation: string[];
  screening_flags: string[];
  deadline_hours: number | null;
}
export interface PotentialDonorPage {
  items: PotentialDonor[];
  total: number;
  page: number;
  total_pages: number;
  radius_km: number;
  outreach_target: number;
  suggested_radius_km: number | null;
  policy_approved: boolean;
  expansion: { radius_km: number; new_candidates: number }[];
  notice: string;
  evaluated_at: string;
}
export async function listPotentialDonors(
  requestId: string,
  radius = 10,
  status = "all",
  bloodType = "",
  page = 1,
): Promise<PotentialDonorPage> {
  const response = await apiClient.get<PotentialDonorPage>(
    "/api/v1/donor-matches/potential",
    {
      params: {
        request_id: requestId,
        radius_km: radius,
        status,
        blood_type: bloodType || undefined,
        page,
      },
    },
  );
  return response.data;
}
export async function inviteDonor(
  requestId: string,
  donorId: string,
  radius = 10,
) {
  await apiClient.post(
    `/api/v1/donor-matches/${requestId}/invite/${donorId}`,
    null,
    { params: { radius_km: radius } },
  );
}
export async function recordVerifiedBloodType(
  responseId: string,
  bloodType: string,
) {
  await apiClient.post(
    `/api/v1/donor-matches/responses/${responseId}/blood-type/verify`,
    { blood_type: bloodType, clinical_confirmation: true },
  );
}
