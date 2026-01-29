import prisma from "@/prisma/prisma";
import { LimitOffset } from "@/utils/schemas/base";

export async function getServerSuites(filters: LimitOffset) {
  const suites = await prisma.testSuite.findMany({
    take: filters.limit + 1,
    skip: filters.offset,
    orderBy: {
      createdAt: "desc",
    },
  });

  const hasMore = suites.length > filters.limit;

  return {
    limit: filters.limit,
    offset: filters.offset,
    hasMore,
    results: suites.slice(0, filters.limit),
  };
}
