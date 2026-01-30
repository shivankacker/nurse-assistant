/**
 * Test Run Worker Orchestrator
 *
 * Main entry point for processing test runs. Coordinates:
 * 1. Loading test run data with all relations
 * 2. Status management (PENDING -> RUNNING -> COMPLETED/FAILED)
 * 3. PDF context loading
 * 4. LLM answer generation for each test case
 * 5. Score calculation (BLEU, Cosine, LLM-as-judge)
 * 6. Result persistence
 */
import prisma from "@/prisma/prisma";
import { loadContexts } from "./services/pdf";
import { generateAnswer, generateAnswerWithAudio } from "./services/llm";
import { loadAudioAsBase64 } from "./services/audio";
import { calculateScores } from "./services/scoring";
import type {
  TestRunWithRelations,
  TestCaseData,
  TestRunResultInput,
  TestContextData,
} from "./types";

// Note: Processing is now sequential for real-time updates
// Concurrency was removed to enable immediate DB writes after each case

/**
 * Process a test run job
 *
 * @param testRunId - ID of the TestRun to process
 */
export async function processTestRun(testRunId: string): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[Worker] Starting test run: ${testRunId}`);
  console.log(`${"=".repeat(60)}\n`);

  const startTime = Date.now();

  // 1. IMMEDIATELY mark as RUNNING for real-time frontend updates
  await prisma.testRun.update({
    where: { id: testRunId },
    data: { status: "RUNNING" },
  });
  console.log(`[Worker] Status: RUNNING`);

  // 2. Fetch test run with all relations
  const testRun = await fetchTestRunWithRelations(testRunId);

  if (!testRun) {
    throw new Error(`TestRun not found: ${testRunId}`);
  }

  console.log(`[Worker] Suite: ${testRun.suite.name}`);
  console.log(`[Worker] Model: ${testRun.llmModel}`);
  console.log(`[Worker] Judge Model: ${testRun.llmJudgeModel || "(env default)"}`);
  console.log(`[Worker] Test cases: ${testRun.suite.testCases.length}`);
  console.log(`[Worker] Contexts: ${testRun.suite.contexts.length}`);

  try {
    // 3. Load all contexts (text + PDFs as base64)
    console.log(`\n[Worker] Loading contexts...`);
    const contextData = await loadContexts(
      testRun.suite.contexts as TestContextData[]
    );
    console.log(`[Worker] Context loaded: ${contextData.length} chars`);

    // 4. Process each test case SEQUENTIALLY and save IMMEDIATELY
    // This enables real-time progress tracking in the frontend
    console.log(`\n[Worker] Processing ${testRun.suite.testCases.length} test cases...`);

    let successCount = 0;
    for (let i = 0; i < testRun.suite.testCases.length; i++) {
      const testCase = testRun.suite.testCases[i] as TestCaseData;

      console.log(`\n[Case ${i + 1}/${testRun.suite.testCases.length}] Processing...`);

      const result = await processTestCaseSafe(testRun, testCase, contextData, i);

      if (result) {
        // Save result IMMEDIATELY (not batched) for real-time updates
        await prisma.testRunResult.create({ data: result });
        console.log(`[Case ${i + 1}] Saved to DB`);

        if (result.status === "COMPLETED") {
          successCount++;
        }
      }
    }

    // 5. Mark as COMPLETED
    const elapsedTime = Date.now() - startTime;
    await prisma.testRun.update({
      where: { id: testRunId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    console.log(`\n${"=".repeat(60)}`);
    console.log(`[Worker] Test run COMPLETED in ${(elapsedTime / 1000).toFixed(2)}s`);
    console.log(`[Worker] Results: ${successCount}/${testRun.suite.testCases.length} successful`);
    console.log(`${"=".repeat(60)}\n`);
  } catch (error) {
    // Mark as FAILED on unrecoverable error
    await prisma.testRun.update({
      where: { id: testRunId },
      data: { status: "FAILED" },
    });

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`\n[Worker] Test run FAILED: ${errorMessage}`);
    throw error;
  }
}

/**
 * Fetch test run with all required relations
 */
async function fetchTestRunWithRelations(
  testRunId: string
): Promise<TestRunWithRelations | null> {
  return prisma.testRun.findUnique({
    where: { id: testRunId },
    include: {
      suite: {
        include: {
          testCases: true,
          contexts: true,
        },
      },
    },
  });
}

/**
 * Get the question text from a test case (supports multimodal)
 */
function getQuestionText(testCase: TestCaseData): string {
  // For now, prioritize text question. Audio/image support can be added later.
  if (testCase.questionText) {
    return testCase.questionText;
  }
  if (testCase.questionAudioPath) {
    return `[Audio question: ${testCase.questionAudioPath}]`;
  }
  if (testCase.questionImagePath) {
    return `[Image question: ${testCase.questionImagePath}]`;
  }
  return "[No question provided]";
}

/**
 * Process a single test case with error handling
 * Returns null if processing fails (doesn't crash the whole run)
 */
async function processTestCaseSafe(
  testRun: TestRunWithRelations,
  testCase: TestCaseData,
  contextData: string,
  index: number
): Promise<TestRunResultInput | null> {
  const caseNum = index + 1;
  const questionText = getQuestionText(testCase);

  try {
    console.log(`\n[Case ${caseNum}] Processing: "${questionText.slice(0, 50)}..."`);

    return await processTestCase(testRun, testCase, contextData);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Case ${caseNum}] FAILED: ${errorMessage}`);

    // Return an error result with FAILED status
    return {
      runId: testRun.id,
      caseId: testCase.id,
      status: "FAILED",
      failReason: errorMessage,
      answer: `[ERROR] ${errorMessage}`,
      bleuScore: 0,
      cosineSimScore: 0,
      llmScore: 0,
      llmScoreReason: `Processing failed: ${errorMessage}`,
    };
  }
}

/**
 * Process a single test case
 * Supports both text questions and audio questions (multimodal)
 */
async function processTestCase(
  testRun: TestRunWithRelations,
  testCase: TestCaseData,
  contextData: string
): Promise<TestRunResultInput> {
  let answer: string;
  let questionForScoring: string;

  // Check if this is an audio question
  if (testCase.questionAudioPath) {
    // AUDIO PATH: Load audio and send directly to multimodal model
    console.log(`  [Audio] Loading: ${testCase.questionAudioPath}`);
    const audio = await loadAudioAsBase64(testCase.questionAudioPath);

    console.log(`  [LLM] Generating answer from audio...`);
    answer = await generateAnswerWithAudio({
      audioBase64: audio.data,
      audioFormat: audio.format,
      prompt: testRun.prompt,
      context: contextData,
      temperature: testRun.temperature,
      topP: testRun.topP,
    });

    // For scoring, use a placeholder since we don't have text
    questionForScoring = `[Audio question from: ${testCase.questionAudioPath}]`;
  } else {
    // TEXT PATH: Standard text-based generation
    questionForScoring = testCase.questionText || "[No question provided]";

    console.log(`  [LLM] Generating answer...`);
    answer = await generateAnswer({
      model: testRun.llmModel,
      prompt: testRun.prompt,
      question: questionForScoring,
      context: contextData,
      temperature: testRun.temperature,
      topP: testRun.topP,
      topK: testRun.topK,
    });
  }

  console.log(`  [LLM] Answer generated: ${answer.length} chars`);

  // 2. Calculate all scores (using TestRun's judge config if set)
  // Pass context so LLM judge can evaluate if answer correctly uses available information
  console.log(`  [Scoring] Calculating scores...`);
  const scores = await calculateScores({
    generatedAnswer: answer,
    expectedAnswer: testCase.expectedAnswer,
    question: questionForScoring,
    context: contextData,
    model: testRun.llmModel,
    judgeModel: testRun.llmJudgeModel,
    judgePrompt: testRun.llmJudgePrompt,
  });

  console.log(`  [Scoring] BLEU: ${scores.bleu.toFixed(3)}, Cosine: ${scores.cosine.toFixed(3)}, LLM: ${scores.llmScore.toFixed(3)}`);

  // 3. Return result with COMPLETED status
  return {
    runId: testRun.id,
    caseId: testCase.id,
    status: "COMPLETED",
    answer,
    bleuScore: scores.bleu,
    cosineSimScore: scores.cosine,
    llmScore: scores.llmScore,
    llmScoreReason: scores.llmReason,
  };
}

/**
 * Process a test run by suite ID (creates a new TestRun)
 * Used when only suite ID is available
 */
export async function processTestRunBySuiteId(
  suiteId: string,
  params: {
    llmModel: string;
    prompt: string;
    temperature: number;
    topP: number;
    topK: number;
    llmJudgeModel?: string | null;
    llmJudgePrompt?: string | null;
  }
): Promise<string> {
  // Create a new TestRun with status PENDING
  const testRun = await prisma.testRun.create({
    data: {
      suiteId,
      llmModel: params.llmModel,
      prompt: params.prompt,
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      llmJudgeModel: params.llmJudgeModel ?? null,
      llmJudgePrompt: params.llmJudgePrompt ?? null,
      status: "PENDING",
    },
  });

  console.log(`[Worker] Created TestRun: ${testRun.id}`);

  // Process it
  await processTestRun(testRun.id);

  return testRun.id;
}
