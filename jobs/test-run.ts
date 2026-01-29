import prisma from "@/prisma/prisma";
import { Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "", {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "test-run",
  async (job) => {
    const data = job.data as { testRunId: string };
    const testRun = await prisma.testRun.findUnique({
      where: { id: data.testRunId },
    });

    if (!testRun) {
      throw new Error("Test run not found");
    }
    // run the test run here
    console.log(testRun);
  },
  { connection },
);
