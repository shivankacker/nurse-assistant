import { NextRequest, NextResponse } from "next/server";
import { getServerSuite } from "./server";
import { testRunQueue } from "@/jobs/queue";
import prisma from "@/prisma/prisma";
import { parseBody } from "@/utils/parse-data";
import { testRunCreateSchema, testRunSerializer } from "@/utils/schemas/tests";
import { zodErrorSerializer } from "@/utils/schemas/base";

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

/**
 * POST /api/tests/suites/[suiteId]
 *
 * Create a new test run for a suite and queue it for processing.
 *
 * Request body:
 * {
 *   llmModel: string,      // Format: "provider:model-id" (e.g., "openai:gpt-4o")
 *   prompt: string,        // System prompt for the LLM
 *   temperature?: number,  // 0-2, default 0.7
 *   topP?: number,         // 0-1, default 1
 *   topK?: number,         // 1-100, default 40
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ suiteId: string }> },
) {
  const { suiteId } = await params;

  // 1. Verify suite exists
  const suite = await getServerSuite(suiteId);
  if (!suite) {
    return NextResponse.json(
      { error: "Test suite not found" },
      { status: 404 },
    );
  }

  // 2. Parse and validate request body
  const parsed = await parseBody(request, testRunCreateSchema);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: zodErrorSerializer(parsed.error) },
      { status: 400 },
    );
  }

  const { llmModel, prompt, temperature, topP, topK } = parsed.data;

  // 3. Create the TestRun record
  const testRun = await prisma.testRun.create({
    data: {
      suiteId,
      llmModel,
      prompt,
      temperature,
      topP,
      topK,
    },
  });

  // 4. Add job to the queue with the testRunId
  const job = await testRunQueue.add("run-test", {
    testRunId: testRun.id,
  });

  return NextResponse.json(
    {
      message: "Test run created and queued",
      testRun: testRunSerializer(testRun),
      jobId: job.id,
    },
    { status: 201 },
  );
}
