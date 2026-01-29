import prisma from "@/prisma/prisma";
import { parseBody } from "@/utils/parse-data";
import {
  testCaseCreateSchema,
  testCaseSerializer,
} from "@/utils/schemas/tests";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ suiteId: string; caseId: string }> },
) {
  const { suiteId, caseId } = await params;
  const parsedBody = await parseBody(request, testCaseCreateSchema);

  if (!parsedBody.success) {
    return NextResponse.json(parsedBody.errors, { status: 400 });
  }

  const newCase = await prisma.testCase.update({
    where: { id: caseId, testSuiteId: suiteId },
    data: {
      questionText:
        "questionText" in parsedBody.data
          ? parsedBody.data.questionText
          : undefined,
      questionAudioPath:
        "questionAudioPath" in parsedBody.data
          ? parsedBody.data.questionAudioPath
          : undefined,
      questionImagePath:
        "questionImagePath" in parsedBody.data
          ? parsedBody.data.questionImagePath
          : undefined,
      expectedAnswer: parsedBody.data.expectedAnswer,
    },
  });

  return NextResponse.json(testCaseSerializer(newCase), { status: 200 });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ suiteId: string; caseId: string }> },
) {
  const { suiteId, caseId } = await params;
  await prisma.testCase.delete({
    where: { id: caseId, testSuiteId: suiteId },
  });

  return NextResponse.json(null, { status: 204 });
}
