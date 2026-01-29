import { NextRequest, NextResponse } from "next/server";
import { getServerContext } from "./server";
import { parseBody } from "@/utils/parse-data";
import {
  contextCreateSchema,
  contextSerializer,
} from "@/utils/schemas/context";
import prisma from "@/prisma/prisma";

export async function GET() {
  const context = await getServerContext();
  return NextResponse.json(context);
}

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, contextCreateSchema);

  if (!parsed.success) {
    return NextResponse.json(parsed.errors, { status: 400 });
  }

  // Create new context in the database
  const context = await prisma.context.create({
    data: {
      text: parsed.data.text,
      filePath: parsed.data.filePath,
      name: parsed.data.name,
    },
  });

  return NextResponse.json(contextSerializer(context), { status: 201 });
}
