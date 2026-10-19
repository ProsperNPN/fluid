import { apiClient } from "@/lib/api";
export const bloodTypes = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
export const components = ["red_cells", "whole_blood", "plasma", "platelets"];
export const unitStatuses = [
  "quarantined",
  "testing",
  "available",
  "reserved",
  "used",
  "expired",
  "discarded",
];
export interface UnitInput {
  blood_type: string;
  component: string;
  official_identifier: string | null;
  product_code: string | null;
  label_standard: string | null;
  collected_at: string | null;
  expires_at: string | null;
  storage_location: string;
}
export interface InventoryUnit extends UnitInput {
  id: string;
  internal_identifier: string;
  batch_id: string;
  status: string;
  testing_status: string;
  version: number;
  quantity: number;
  clinically_available: boolean;
  recall_active: boolean;
  temperature_c: number | null;
  reserved_request_id: string | null;
  qr_payload: string;
  created_at: string;
}
export interface UnitAction {
  action: string;
  expected_version: number;
  reason: string;
  clinical_authorization?: boolean;
  cold_chain_verified?: boolean;
  official_label_verified?: boolean;
  compatibility_verified?: boolean;
  recall_resolved?: boolean;
  testing_status?: string;
  request_id?: string;
  storage_location?: string;
  temperature_c?: number;
}
export interface StockGroup {
  blood_type: string;
  component: string;
  available: number;
  reserved: number;
  total: number;
  minimum: number;
  critical: number;
  level: string;
  shortage: number;
}
export interface StockSummary {
  available: number;
  reserved: number;
  physical_units: number;
  low_groups: number;
  critical_groups: number;
  expiring_soon: number;
  quarantined: number;
  groups: StockGroup[];
  trend: { date: string; available_change: number; movements: number }[];
}
export interface ComponentPolicy {
  component: string;
  version: number;
  approved: boolean;
  standard_reference: string;
  max_shelf_life_hours: number | null;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  storage_requirements: string;
  expiry_warning_hours: number;
}
export interface UnitHistory {
  id: string;
  action: string;
  actor_user_id: string | null;
  created_at: string;
  details: {
    reason?: string;
    before?: { status?: string; storage_location?: string };
    after?: { status?: string; storage_location?: string };
    available_delta?: number;
  };
}
export async function inventorySummary() {
  return (await apiClient.get<StockSummary>("/api/v1/inventory/summary")).data;
}
export async function listUnits(
  params: Record<string, string | number | undefined>,
) {
  return (
    await apiClient.get<{
      items: InventoryUnit[];
      total: number;
      page: number;
      total_pages: number;
    }>("/api/v1/inventory/units", { params })
  ).data;
}
export async function receiveUnit(input: UnitInput) {
  return (await apiClient.post<InventoryUnit>("/api/v1/inventory/units", input))
    .data;
}
export async function editUnit(
  id: string,
  input: UnitInput & {
    expected_version: number;
    reason: string;
    clinical_authorization: boolean;
  },
) {
  return (
    await apiClient.put<InventoryUnit>(`/api/v1/inventory/units/${id}`, input)
  ).data;
}
export async function actOnUnit(id: string, input: UnitAction) {
  return (
    await apiClient.post<InventoryUnit>(
      `/api/v1/inventory/units/${id}/actions`,
      input,
    )
  ).data;
}
export async function scanUnit(value: string) {
  return (
    await apiClient.post<InventoryUnit>("/api/v1/inventory/scan", { value })
  ).data;
}
export async function unitHistory(id: string, page = 1) {
  return (
    await apiClient.get<{ items: UnitHistory[] }>(
      `/api/v1/inventory/units/${id}/history`,
      { params: { page } },
    )
  ).data;
}
export async function unitQr(id: string) {
  return (
    await apiClient.get<Blob>(`/api/v1/inventory/units/${id}/qr`, {
      responseType: "blob",
    })
  ).data;
}
export async function componentPolicies() {
  return (
    await apiClient.get<{ items: ComponentPolicy[] }>(
      "/api/v1/inventory/component-policies",
    )
  ).data.items;
}
export async function saveComponentPolicy(
  policy: ComponentPolicy,
  authorized: boolean,
) {
  return (
    await apiClient.put(
      `/api/v1/inventory/component-policies/${policy.component}`,
      {
        ...policy,
        expected_version: policy.version,
        clinical_authorization: authorized,
      },
    )
  ).data;
}
export async function saveStockPolicy(group: StockGroup) {
  return (
    await apiClient.put("/api/v1/inventory/stock-policy", {
      blood_type: group.blood_type,
      component: group.component,
      minimum: group.minimum,
      critical: group.critical,
    })
  ).data;
}

export async function unitDetail(id: string) {
  return (await apiClient.get<InventoryUnit>(`/api/v1/inventory/units/${id}`))
    .data;
}

export async function receiveInventory(input: UnitInput, quantity: number) {
  return (
    await apiClient.post("/api/v1/inventory/units/intake", {
      ...input,
      quantity,
    })
  ).data;
}
