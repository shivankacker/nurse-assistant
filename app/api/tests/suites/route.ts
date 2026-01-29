import { parseBody, parseQueryParams } from "@/utils/parse-data";
import { limitOffsetSchema } from "@/utils/schemas/base";
import { NextRequest, NextResponse } from "next/server";
import { getServerSuites } from "./server";
import {
  testSuiteCreateSchema,
  testSuiteSerializer,
} from "@/utils/schemas/tests";
import prisma from "@/prisma/prisma";

export async function GET(request: NextRequest) {
  const queryParams = parseQueryParams(request, limitOffsetSchema);

  if (!queryParams.success) {
    return NextResponse.json(queryParams.errors, { status: 400 });
  }

  const data = await getServerSuites(queryParams.data);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const parsedBody = await parseBody(request, testSuiteCreateSchema);

  if (!parsedBody.success) {
    return NextResponse.json(parsedBody.errors, { status: 400 });
  }

  const newSuite = await prisma.testSuite.create({
    data: {
      name: parsedBody.data.name,
    },
  });

  return NextResponse.json(testSuiteSerializer(newSuite), { status: 201 });
}
