import prisma from "@/prisma/prisma";
import { chatSerializer } from "@/utils/schemas/chat";
import { LimitOffset } from "@/utils/schemas/base";

export async function getServerChats(filters: LimitOffset) {
  const chats = await prisma.chat.findMany({
    take: filters.limit + 1,
    skip: filters.offset,
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
        take: 1, // Only get first message for list view
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  const hasMore = chats.length > filters.limit;

  return {
    limit: filters.limit,
    offset: filters.offset,
    hasMore,
    results: chats.slice(0, filters.limit).map(chatSerializer),
  };
}

export async function getServerChat(id: string) {
  const chat = await prisma.chat.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!chat) return null;

  return chatSerializer(chat);
}
