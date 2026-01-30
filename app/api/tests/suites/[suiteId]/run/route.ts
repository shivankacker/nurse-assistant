import { testRunQueue } from "@/jobs/queue";
import prisma from "@/prisma/prisma";
import { parseBody } from "@/utils/parse-data";
import { testRunCreateSchema, testRunSerializer } from "@/utils/schemas/tests";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ suiteId: string }> },
) {
  const { suiteId } = await params;

  const parsedBody = await parseBody(request, testRunCreateSchema);

  if (!parsedBody.success) {
    return NextResponse.json(parsedBody.errors, { status: 400 });
  }

  const testRun = await prisma.testRun.create({
    data: {
      llmModel: parsedBody.data.llmModel,
      prompt: parsedBody.data.prompt,
      temperature: parsedBody.data.temperature,
      topP: parsedBody.data.topP,
      topK: parsedBody.data.topK,
      suiteId,
    },
    include: {
      suite: {
        include: {
          contexts: true,
          testCases: true,
        },
      },
      testRunResults: true,
    },
  });

  // Add job to the queue
  await testRunQueue.add("run-test", {
    testRunId: testRun.id,
  });

  return NextResponse.json(testRunSerializer(testRun));
}
