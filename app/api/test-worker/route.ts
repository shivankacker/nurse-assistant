import { testRunQueue } from "@/jobs/queue";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const queryParams = Object.fromEntries(
    new URL(request.url).searchParams.entries(),
  );

  const { testRunId } = queryParams;

  if (!testRunId) {
    return NextResponse.json(
      { error: "testRunId query parameter is required" },
      { status: 400 },
    );
  }

  // Add job to the queue
  const job = await testRunQueue.add("run-test", {
    testRunId,
  });

  return NextResponse.json({
    message: "Test run queued",
    jobId: job.id,
  });
}
