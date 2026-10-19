import { apiClient } from "@/lib/api";

export interface Place {
  latitude: number;
  longitude: number;
  city: string;
  region: string | null;
  country: string;
  address: string;
}
export interface LocationSelection extends Place {
  source: "gps" | "manual" | "live";
  accuracy_m?: number | null;
  confirmed: true;
  preferred_radius_km?: 5 | 10 | 25 | 50 | 100;
}
export interface SavedLocation {
  latitude: number | null;
  longitude: number | null;
  city: string;
  region: string | null;
  country: string;
  address: string | null;
  source: string | null;
  accuracy_m: number | null;
  updated_at: string | null;
  confirmed_at: string | null;
  preferred_radius_km: number | null;
}
export const getLocation = async () =>
  (await apiClient.get<SavedLocation>("/api/v1/locations/me")).data;
export const saveLocation = async (
  location: LocationSelection,
  signal?: AbortSignal,
) => {
  const result = (
    await apiClient.patch<SavedLocation>("/api/v1/locations/me", location, {
      signal,
    })
  ).data;
  window.dispatchEvent(new Event("fluid:location-updated"));
  return result;
};
export const searchPlaces = async (q: string, signal?: AbortSignal) =>
  (await apiClient.post<Place[]>("/api/v1/locations/search", { q }, { signal }))
    .data;
export const reverseLocation = async (
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
) =>
  (
    await apiClient.post<Place[]>(
      "/api/v1/locations/reverse",
      { latitude, longitude },
      { signal },
    )
  ).data;
export interface NearbyHospital {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  distance_km: number;
}
export interface NearbyRequest {
  id: string;
  hospital_name: string;
  latitude: number;
  longitude: number;
  blood_type: string;
  component: string;
  urgency: string;
  units: number;
  distance_km: number;
  location: string;
}
export interface NearbyPlaces {
  radius_km: number;
  hospitals: NearbyHospital[];
  requests: NearbyRequest[];
  notice: string;
  has_more: boolean;
}
export const getNearby = async (urgency: string) =>
  (
    await apiClient.get<NearbyPlaces>("/api/v1/locations/nearby", {
      params: { urgency },
    })
  ).data;
export const setRadius = async (radius: number) => {
  await apiClient.patch("/api/v1/locations/radius", null, {
    params: { radius_km: radius },
  });
  window.dispatchEvent(new Event("fluid:location-updated"));
};

export function geolocationMessage(error: GeolocationPositionError) {
  return error.code === 1
    ? "Location permission was denied. Search or enter your location manually."
    : error.code === 3
      ? "GPS timed out. Try again outdoors or enter your location manually."
      : "GPS is unavailable. Search or enter your location manually.";
}
