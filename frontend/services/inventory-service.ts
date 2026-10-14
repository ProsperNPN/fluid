import { apiClient } from "@/lib/api";
import {
  ensureArray,
  ensureNumber,
  ensureNullableString,
  ensureRecord,
  ensureString,
} from "@/lib/api/contracts";
import type { BloodType } from "@/types";
export interface InventoryItem {
  id: string;
  bloodType: BloodType;
  component: string;
  unitsAvailable: number;
  unitsReserved: number;
  collectionDate: string | null;
  expirationDate: string | null;
  storageLocation: string;
  minimumThreshold: number;
  alertLevel:
    "normal" | "low" | "critical" | "expired" | "expiring_soon" | "unknown";
  updatedAt: string;
}
function parse(data: unknown, context: string): InventoryItem {
  const r = ensureRecord(data, context);
  return {
    id: ensureString(r.id, `${context}.id`),
    bloodType: ensureString(r.blood_type, `${context}.blood_type`) as BloodType,
    component: ensureString(r.component, `${context}.component`),
    unitsAvailable: ensureNumber(
      r.units_available,
      `${context}.units_available`,
    ),
    unitsReserved: ensureNumber(r.units_reserved, `${context}.units_reserved`),
    collectionDate: ensureNullableString(
      r.collection_date,
      `${context}.collection_date`,
    ),
    expirationDate: ensureNullableString(
      r.expiration_date,
      `${context}.expiration_date`,
    ),
    storageLocation: ensureString(
      r.storage_location,
      `${context}.storage_location`,
    ),
    minimumThreshold: ensureNumber(
      r.minimum_threshold,
      `${context}.minimum_threshold`,
    ),
    alertLevel: ensureString(
      r.alert_level,
      `${context}.alert_level`,
    ) as InventoryItem["alertLevel"],
    updatedAt: ensureString(r.updated_at, `${context}.updated_at`),
  };
}
export async function listInventory(alertOnly = false) {
  const response = await apiClient.get<unknown>("/api/v1/inventory", {
    params: { alert_only: alertOnly },
  });
  const r = ensureRecord(response.data, "inventory");
  return ensureArray(r.items, "inventory.items").map((v, i) =>
    parse(v, `inventory.items[${i}]`),
  );
}
export async function createInventory(input: {
  bloodType: BloodType;
  component: string;
  unitsAvailable: number;
  expirationDate: string | null;
  collectionDate?: string | null;
  storageLocation: string;
  minimumThreshold: number;
}) {
  const response = await apiClient.post<unknown>("/api/v1/inventory", {
    blood_type: input.bloodType,
    component: input.component,
    units_available: input.unitsAvailable,
    expiration_date: input.expirationDate,
    collection_date: input.collectionDate,
    storage_location: input.storageLocation,
    minimum_threshold: input.minimumThreshold,
  });
  return parse(response.data, "inventory create");
}
export async function adjustInventory(
  id: string,
  action:
    | "add"
    | "remove"
    | "reserve"
    | "release"
    | "use"
    | "expire"
    | "donation_intake",
  units: number,
  reason?: string,
) {
  const response = await apiClient.post<unknown>(
    `/api/v1/inventory/${id}/adjust`,
    { action, units, reason },
  );
  return parse(response.data, "inventory adjust");
}

export interface InventoryTransaction {
  id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown> | null;
}
export async function getInventoryTransactions(
  id: string,
): Promise<InventoryTransaction[]> {
  const response = await apiClient.get(`/api/v1/inventory/${id}/transactions`);
  return response.data.items;
}
export async function setInventoryThreshold(id: string, threshold: number) {
  await apiClient.patch(`/api/v1/inventory/${id}/settings`, {
    minimum_threshold: threshold,
  });
}
