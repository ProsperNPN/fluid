import { apiClient } from "@/lib/api";
import {
  ensureArray,
  ensureBoolean,
  ensureEnum,
  ensureNumber,
  ensureNullableString,
  ensureRecord,
  ensureString,
} from "@/lib/api/contracts";
import type { NotificationItem } from "@/types";

function relative(iso: string) {
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - new Date(iso).getTime()) / 60000),
  );
  return minutes < 60
    ? `${minutes}m ago`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h ago`
      : `${Math.floor(minutes / 1440)}d ago`;
}
function parse(data: unknown, context: string): NotificationItem {
  const row = ensureRecord(data, context);
  const createdAt = ensureString(row.created_at, `${context}.created_at`);
  return {
    createdAt,
    emergency: row.payload
      ? (row.payload as NotificationItem["emergency"])
      : null,
    id: ensureString(row.id, `${context}.id`),
    type: ensureString(row.type, `${context}.type`),
    title: ensureString(row.title, `${context}.title`),
    message: ensureString(row.message, `${context}.message`),
    level: ensureEnum(
      row.level,
      ["info", "warning", "success"] as const,
      `${context}.level`,
    ),
    isRead: ensureBoolean(row.is_read, `${context}.is_read`),
    relatedPath: ensureNullableString(
      row.related_path,
      `${context}.related_path`,
    ),
    time: relative(createdAt),
  };
}

export async function listNotifications(
  unreadOnly = false,
  page = 1,
): Promise<{
  items: NotificationItem[];
  unreadCount: number;
  totalPages: number;
}> {
  const response = await apiClient.get<unknown>("/api/v1/notifications", {
    params: { unread_only: unreadOnly, page, page_size: 50 },
  });
  const record = ensureRecord(response.data, "notifications.list response");
  const deliveredIds = ensureArray(record.items, "notifications.items").map(item => ensureString(ensureRecord(item, "notification").id, "notification.id"));
  if (deliveredIds.length) void apiClient.post("/api/v1/notifications/received", { ids: deliveredIds }).catch(() => undefined);
  return {
    totalPages: ensureNumber(record.total_pages, "notifications.total_pages"),
    items: ensureArray(record.items, "notifications.items").map((item, index) =>
      parse(item, `notifications.items[${index}]`),
    ),
    unreadCount: ensureNumber(
      record.unread_count,
      "notifications.unread_count",
    ),
  };
}
export async function markNotificationRead(id: string) {
  const response = await apiClient.patch<unknown>(
    `/api/v1/notifications/${id}/read`,
  );
  return parse(response.data, "notifications.read response");
}
export async function markAllNotificationsRead() {
  await apiClient.patch("/api/v1/notifications/read-all");
}
export async function deleteNotification(id: string) {
  await apiClient.delete(`/api/v1/notifications/${id}`);
}

export async function markNotificationUnread(id: string) {
  await apiClient.patch(`/api/v1/notifications/${id}/unread`);
}
