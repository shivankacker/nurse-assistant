import { Chat, ChatMessage } from "@/prisma/client";
import z from "zod";

export function chatMessageSerializer(message: ChatMessage) {
  return {
    id: message.id,
    chatId: message.chatId,
    role: message.role,
    content: message.content,
    contextIds: message.contextIds,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

export type ChatMessageSerialized = ReturnType<typeof chatMessageSerializer>;

export function chatSerializer(chat: Chat & { messages?: ChatMessage[] }) {
  return {
    id: chat.id,
    projectId: chat.projectId,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messages: chat.messages?.map(chatMessageSerializer) || [],
  };
}

export type ChatSerialized = ReturnType<typeof chatSerializer>;

export const chatCreateSchema = z.object({
  projectId: z.string(),
});

export type ChatCreatePayload = z.infer<typeof chatCreateSchema>;

export const chatMessageCreateSchema = z.object({
  chatId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
  contextIds: z.array(z.string()).optional().default([]),
});

export type ChatMessageCreatePayload = z.infer<typeof chatMessageCreateSchema>;
