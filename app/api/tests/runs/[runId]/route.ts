import { NextRequest, NextResponse } from "next/server";
import { getServerTestRun } from "./server";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  const run = await getServerTestRun(runId);

  if (!run) {
    return NextResponse.json({ error: "Test run not found" }, { status: 404 });
  }

  return NextResponse.json(run);
}
