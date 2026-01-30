import { NextRequest, NextResponse } from "next/server";
import { getServerSuite } from "./server";
import { testRunQueue } from "@/jobs/queue";
import { parseBody } from "@/utils/parse-data";
import {
  testSuiteSerializer,
  testSuiteUpdateSchema,
} from "@/utils/schemas/tests";
import prisma from "@/prisma/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ suiteId: string }> },
) {
  const { suiteId } = await params;
  const suite = await getServerSuite(suiteId);

  if (!suite) {
    return NextResponse.json(
      { error: "Test suite not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(suite);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ suiteId: string }> },
) {
  const { suiteId } = await params;

  const parsedBody = await parseBody(request, testSuiteUpdateSchema);

  if (!parsedBody.success) {
    return NextResponse.json(parsedBody.errors, { status: 400 });
  }

  const updatedSuite = await prisma.testSuite.update({
    where: { id: suiteId },
    data: {
      name: parsedBody.data.name,
      contexts: {
        set: parsedBody.data.contextIds.map((id) => ({ id })),
      },
    },
    include: {
      contexts: true,
      testCases: true,
    },
  });

  return NextResponse.json(testSuiteSerializer(updatedSuite));
}
