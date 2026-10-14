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
export async function listHospitalDonorResponses() {
  const response = await apiClient.get<unknown>("/api/v1/donor-matches", {
    params: { page: 1, page_size: 50 },
  });
  const row = ensureRecord(response.data, "hospital donor responses");
  return {
    items: ensureArray(row.items, "hospital donor responses.items").map(
      (v, i) => parse(v, `hospital donor responses.items[${i}]`),
    ),
    total: ensureNumber(row.total, "hospital donor responses.total"),
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
  distance_km: number | null;
  approximate_location: string;
  response_status: string | null;
  eligibility_status: string;
}
export async function listPotentialDonors(
  requestId: string,
): Promise<PotentialDonor[]> {
  const response = await apiClient.get("/api/v1/donor-matches/potential", {
    params: { request_id: requestId },
  });
  return response.data.items;
}
export async function inviteDonor(requestId: string, donorId: string) {
  await apiClient.post(`/api/v1/donor-matches/${requestId}/invite/${donorId}`);
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
