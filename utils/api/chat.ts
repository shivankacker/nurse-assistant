import { request } from ".";
import { LimitOffset, PaginatedResponse } from "../schemas/base";
import {
  ChatCreatePayload,
  ChatMessageCreatePayload,
  ChatMessageSerialized,
  ChatSerialized,
} from "../schemas/chat";

export const chatApi = {
  list: (filters: LimitOffset) =>
    request<PaginatedResponse<ChatSerialized>>("/chats", "GET", filters),
  create: (data: ChatCreatePayload) =>
    request<ChatSerialized>("/chats", "POST", data),
  get: (id: string) => request<ChatSerialized>(`/chats/${id}`, "GET"),
  delete: (id: string) => request(`/chats/${id}`, "DELETE"),
};

export const chatMessageApi = {
  create: (data: ChatMessageCreatePayload) =>
    request<ChatMessageSerialized>("/chats/messages", "POST", data),
};
