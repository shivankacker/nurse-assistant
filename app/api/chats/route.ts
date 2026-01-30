import { parseBody, parseQueryParams } from "@/utils/parse-data";
import { limitOffsetSchema } from "@/utils/schemas/base";
import { NextRequest, NextResponse } from "next/server";
import { getServerChats } from "./server";
import { chatCreateSchema, chatSerializer } from "@/utils/schemas/chat";
import prisma from "@/prisma/prisma";

export async function GET(request: NextRequest) {
  const queryParams = parseQueryParams(request, limitOffsetSchema);

  if (!queryParams.success) {
    return NextResponse.json(queryParams.errors, { status: 400 });
  }

  const data = await getServerChats(queryParams.data);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const parsedBody = await parseBody(request, chatCreateSchema);

  if (!parsedBody.success) {
    return NextResponse.json(parsedBody.errors, { status: 400 });
  }

  const newChat = await prisma.chat.create({
    data: {
      projectId: parsedBody.data.projectId,
    },
    include: {
      messages: true,
    },
  });

  return NextResponse.json(chatSerializer(newChat), { status: 201 });
}
