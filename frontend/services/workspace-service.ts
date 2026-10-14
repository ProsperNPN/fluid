import { apiClient } from "@/lib/api";
import {
  ensureArray,
  ensureNumber,
  ensureRecord,
  ensureString,
} from "@/lib/api/contracts";

export async function getWorkspaceOverview(): Promise<
  Record<string, number | boolean>
> {
  const response = await apiClient.get("/api/v1/workspace/overview");
  const record = ensureRecord(response.data, "workspace overview");
  const result: Record<string, number | boolean> = {};
  Object.entries(record).forEach(([key, value]) => {
    result[key] =
      typeof value === "boolean"
        ? value
        : ensureNumber(value, `workspace.${key}`);
  });
  return result;
}
export interface AnalyticsDay {
  date: string;
  requests: number;
  fulfilled: number;
  pending: number;
  cancelled: number;
  donations: number;
  stockChange: number;
}
export async function getWorkspaceAnalytics(
  days: number,
): Promise<AnalyticsDay[]> {
  const response = await apiClient.get("/api/v1/workspace/analytics", {
    params: { days },
  });
  const record = ensureRecord(response.data, "workspace analytics");
  return ensureArray(record.series, "analytics.series").map((value) => {
    const row = ensureRecord(value, "analytics day");
    return {
      date: ensureString(row.date, "date"),
      requests: ensureNumber(row.requests, "requests"),
      fulfilled: ensureNumber(row.fulfilled, "fulfilled"),
      pending: ensureNumber(row.pending, "pending"),
      cancelled: ensureNumber(row.cancelled, "cancelled"),
      donations: ensureNumber(row.donations, "donations"),
      stockChange: ensureNumber(row.stock_change, "stock_change"),
    };
  });
}
