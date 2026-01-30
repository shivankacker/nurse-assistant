/**
 * Test Run Worker
 *
 * BullMQ worker that processes test run jobs from the queue.
 * Delegates actual processing to the worker orchestrator.
 *
 * Job data format: { testRunId?: string, suiteId?: string }
 *
 * Usage:
 *   pnpm worker
 *
 * The worker will:
 * 1. Pick up jobs from the "test-run" queue
 * 2. Process each test case in the associated suite
 * 3. Generate LLM answers using configured model
 * 4. Calculate scores (BLEU, Cosine, LLM-as-judge)
 * 5. Save results and update status
 */

// Load environment variables from .env and .env.local
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processTestRun, processTestRunBySuiteId } from "./worker";
import type { TestRunJobData } from "./worker/types";

// Default LLM parameters when only suiteId is provided
const DEFAULT_LLM_PARAMS = {
  llmModel: process.env.DEFAULT_LLM_MODEL || "openai:gpt-4o-mini",
  prompt: "Answer the following question accurately and concisely based on the provided context:",
  temperature: 0.7,
  topP: 1,
  topK: 0,
  // Judge config: null means use env defaults
  llmJudgeModel: process.env.LLM_JUDGE_MODEL || null,
  llmJudgePrompt: process.env.LLM_JUDGE_PROMPT || null,
};

// Redis connection for BullMQ
const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null, // Required for BullMQ
});

// Create the worker
export const testRunWorker = new Worker<TestRunJobData>(
  "test-run",
  async (job) => {
    const { testRunId, suiteId } = job.data;

    // Handle both cases: testRunId (direct) or suiteId (create TestRun first)
    if (testRunId) {
      console.log(`[Worker] Job ${job.id} received for TestRun: ${testRunId}`);
      await processTestRun(testRunId);
    } else if (suiteId) {
      console.log(`[Worker] Job ${job.id} received for Suite: ${suiteId}`);
      console.log(`[Worker] Creating TestRun with default params...`);
      await processTestRunBySuiteId(suiteId, DEFAULT_LLM_PARAMS);
    } else {
      throw new Error("Job data missing both testRunId and suiteId");
    }

    console.log(`[Worker] Job ${job.id} completed successfully`);
  },
  {
    connection,
    concurrency: 2, // Process up to 2 jobs simultaneously
    removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
    removeOnFail: { count: 50 }, // Keep last 50 failed jobs
  }
);

// Worker event handlers for monitoring
testRunWorker.on("ready", () => {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║               TEST RUN WORKER STARTED                       ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Queue: test-run                                           ║");
  console.log("║  Redis: " + (process.env.REDIS_URL || "redis://localhost:6379").padEnd(42) + " ║");
  console.log("║  Concurrency: 2                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
  console.log("[Worker] Waiting for jobs...\n");
});

testRunWorker.on("completed", (job) => {
  console.log(`[Worker] ✓ Job ${job.id} completed`);
});

testRunWorker.on("failed", (job, err) => {
  console.error(`[Worker] ✗ Job ${job?.id} failed: ${err.message}`);
});

testRunWorker.on("error", (err) => {
  console.error("[Worker] Error:", err.message);
});

testRunWorker.on("stalled", (jobId) => {
  console.warn(`[Worker] ⚠ Job ${jobId} stalled`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[Worker] Shutting down...");
  await testRunWorker.close();
  await connection.quit();
  console.log("[Worker] Shutdown complete");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n[Worker] Received SIGTERM, shutting down...");
  await testRunWorker.close();
  await connection.quit();
  process.exit(0);
});

// Export for external use
export default testRunWorker;
