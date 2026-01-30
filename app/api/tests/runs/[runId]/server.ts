import prisma from "@/prisma/prisma";
import { LimitOffset } from "@/utils/schemas/base";
import { testRunSerializer } from "@/utils/schemas/tests";

export async function getServerTestRun(runId: string) {
  const testRun = await prisma.testRun.findUnique({
    where: {
      id: runId,
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

  return testRun ? testRunSerializer(testRun) : null;
}
