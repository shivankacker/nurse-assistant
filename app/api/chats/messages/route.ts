import { parseBody } from "@/utils/parse-data";
import { NextRequest, NextResponse } from "next/server";
import {
  chatMessageCreateSchema,
  chatMessageSerializer,
} from "@/utils/schemas/chat";
import prisma from "@/prisma/prisma";

export async function POST(request: NextRequest) {
  const parsedBody = await parseBody(request, chatMessageCreateSchema);

  if (!parsedBody.success) {
    return NextResponse.json(parsedBody.errors, { status: 400 });
  }

  const newMessage = await prisma.chatMessage.create({
    data: {
      chatId: parsedBody.data.chatId,
      role: parsedBody.data.role,
      content: parsedBody.data.content,
      contextIds: parsedBody.data.contextIds,
    },
  });

  return NextResponse.json(chatMessageSerializer(newMessage), { status: 201 });
}
