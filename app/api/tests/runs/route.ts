import { parseQueryParams } from "@/utils/parse-data";
import { limitOffsetSchema } from "@/utils/schemas/base";
import { NextRequest, NextResponse } from "next/server";
import { getServerTestRuns } from "./server";

export async function GET(request: NextRequest) {
  const parsedParams = parseQueryParams(request, limitOffsetSchema);

  if (!parsedParams.success) {
    return NextResponse.json(parsedParams.errors, { status: 400 });
  }

  const runs = await getServerTestRuns(parsedParams.data);

  return NextResponse.json(runs);
}
