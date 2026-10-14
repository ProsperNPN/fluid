import { apiClient } from "@/lib/api";
import {
  ensureArray,
  ensureBoolean,
  ensureNumber,
  ensureRecord,
  ensureString,
} from "@/lib/api/contracts";
export interface Conversation {
  id: string;
  name: string;
  requestId: string;
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
}
export interface PrivateMessage {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
}
export async function listConversations() {
  const response = await apiClient.get("/api/v1/messages");
  const record = ensureRecord(response.data, "conversations");
  return {
    unreadCount: ensureNumber(record.unread_count, "unread count"),
    items: ensureArray(record.items, "conversations.items").map((value) => {
      const row = ensureRecord(value, "conversation");
      return {
        id: ensureString(row.id, "id"),
        name: ensureString(row.name, "name"),
        requestId: ensureString(row.request_id, "request"),
        lastMessage: ensureString(row.last_message, "message"),
        updatedAt: ensureString(row.updated_at, "updated"),
        unreadCount: ensureNumber(row.unread_count, "unread"),
      };
    }),
  };
}
export async function openConversation(
  requestId: string,
  donorUserId?: string,
) {
  const response = await apiClient.post("/api/v1/messages/conversations", {
    request_id: requestId,
    donor_user_id: donorUserId,
  });
  return ensureString(ensureRecord(response.data, "conversation").id, "id");
}
export async function readConversation(
  id: string,
  before?: string,
): Promise<PrivateMessage[]> {
  const response = await apiClient.get(`/api/v1/messages/conversations/${id}`, {
    params: { before },
  });
  return ensureArray(
    ensureRecord(response.data, "messages").items,
    "items",
  ).map((value) => {
    const row = ensureRecord(value, "message");
    return {
      id: ensureString(row.id, "id"),
      body: ensureString(row.body, "body"),
      createdAt: ensureString(row.created_at, "created"),
      mine: ensureBoolean(row.mine, "mine"),
    };
  });
}
export async function sendPrivateMessage(id: string, body: string) {
  await apiClient.post(`/api/v1/messages/conversations/${id}`, { body });
}
