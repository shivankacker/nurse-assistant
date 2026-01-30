import prisma from "@/prisma/prisma";
import { LimitOffset } from "@/utils/schemas/base";
import { testRunSerializer } from "@/utils/schemas/tests";

export async function getServerTestRuns(filters: LimitOffset) {
  const testRuns = await prisma.testRun.findMany({
    take: filters.limit + 1,
    skip: filters.offset,
    include: {
      suite: {
        include: {
          contexts: true,
          testCases: true,
        },
      },
      testRunResults: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const hasMore = testRuns.length > filters.limit;

  return {
    limit: filters.limit,
    offset: filters.offset,
    hasMore,
    results: testRuns.slice(0, filters.limit).map(testRunSerializer),
  };
}
