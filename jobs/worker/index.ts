/**
 * Test Run Worker Orchestrator
 *
 * Main entry point for processing test runs. Coordinates:
 * 1. Loading test run data with all relations
 * 2. Status management (PENDING -> RUNNING -> COMPLETED/FAILED)
 * 3. PDF context loading
 * 4. LLM answer generation via Realtime API (text or audio input)
 * 5. Score calculation (BLEU, Cosine, LLM-as-judge)
 * 6. Result persistence
 *
 * Uses OpenAI Realtime API for answer generation to match the main
 * application's behavior, supporting both text and audio questions.
 */
import prisma from "@/prisma/prisma";
import { LLMS } from "@/utils/constants";
import pLimit from "p-limit";
import { loadContexts } from "./services/pdf";
import { generateAnswerRealtime } from "./services/realtime";
import { generateAnswer } from "./services/llm";
import { calculateScores } from "./services/scoring";
import type {
  TestRunWithRelations,
  TestCaseData,
  TestRunResultInput,
  TestContextData,
} from "./types";

// Concurrency limit for LLM calls (to avoid rate limits)
const LLM_CONCURRENCY = 3;

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

  // 1. Fetch test run with all relations
  const testRun = await fetchTestRunWithRelations(testRunId);

  if (!testRun) {
    throw new Error(`TestRun not found: ${testRunId}`);
  }

  console.log(`[Worker] Suite: ${testRun.suite.name}`);
  const modelConfig = LLMS[testRun.llmModel as keyof typeof LLMS];
  const selectedTextTransport = modelConfig?.textTransport || "vercel";
  console.log(
    `[Worker] Model: ${testRun.llmModel} (text via ${selectedTextTransport}, audio via realtime)`
  );
  console.log(`[Worker] Prompt: "${testRun.prompt.slice(0, 50)}..."`);
  console.log(`[Worker] Test cases: ${testRun.suite.testCases.length}`);
  console.log(`[Worker] Contexts: ${testRun.suite.contexts.length}`);

  try {
    // 3. Load all contexts (text + PDFs as base64)
    console.log(`\n[Worker] Loading contexts...`);
    const contextData = await loadContexts(
      testRun.suite.contexts as TestContextData[]
    );
    console.log(`[Worker] Context loaded: ${contextData.length} chars`);

    // 4. Process each test case with concurrency limit
    console.log(`\n[Worker] Processing ${testRun.suite.testCases.length} test cases...`);

    const limit = pLimit(LLM_CONCURRENCY);
    const results = await Promise.all(
      testRun.suite.testCases.map((testCase, index) =>
        limit(() =>
          processTestCaseSafe(testRun, testCase as TestCaseData, contextData, index)
        )
      )
    );

    // Filter out any null results (from failed cases)
    const validResults = results.filter(
      (r): r is TestRunResultInput => r !== null
    );

    // 5. Save all results
    if (validResults.length > 0) {
      console.log(`\n[Worker] Saving ${validResults.length} results...`);
      await prisma.testRunResult.createMany({
        data: validResults,
      });
    }

    // 6. Mark as completed
    const elapsedTime = Date.now() - startTime;
    await prisma.testRun.update({
      where: { id: testRunId },
      data: {
        completedAt: new Date(),
      },
    });

    console.log(`\n${"=".repeat(60)}`);
    console.log(`[Worker] Test run COMPLETED in ${(elapsedTime / 1000).toFixed(2)}s`);
    console.log(`[Worker] Results: ${validResults.length}/${testRun.suite.testCases.length} successful`);
    console.log(`${"=".repeat(60)}\n`);
  } catch (error) {
    // 7. Log failure (status is now tracked per TestRunResult)
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
 * Get the question text from a test case for logging/scoring
 * Audio questions will be transcribed by the Realtime API
 */
function getQuestionText(testCase: TestCaseData): string {
  if (testCase.questionText) {
    return testCase.questionText;
  }
  if (testCase.questionAudioPath) {
    // Will be transcribed by Realtime API
    return `[Audio: ${testCase.questionAudioPath}]`;
  }
  if (testCase.questionImagePath) {
    return `[Image: ${testCase.questionImagePath}]`;
  }
  return "[No question provided]";
}

/**
 * Determine input type for a test case
 */
function getInputType(testCase: TestCaseData): "text" | "audio" | "none" {
  if (testCase.questionAudioPath && testCase.questionAudioPath.trim() !== "") {
    return "audio";
  }
  if (testCase.questionText && testCase.questionText.trim() !== "") {
    return "text";
  }
  return "none";
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
 * Process a single test case using Realtime API
 *
 * Supports both text and audio questions, matching the main app's behavior.
 */
async function processTestCase(
  testRun: TestRunWithRelations,
  testCase: TestCaseData,
  contextData: string
): Promise<TestRunResultInput> {
  const inputType = getInputType(testCase);
  const questionDisplay = getQuestionText(testCase);

  if (inputType === "none") {
    throw new Error("Test case has no question (text or audio)");
  }

  // 1. Generate answer (audio always via Realtime; text via Realtime only when selected)
  const modelConfig = LLMS[testRun.llmModel as keyof typeof LLMS];
  const selectedTextTransport = modelConfig?.textTransport || "vercel";

  let answer: string;
  let questionForScoring: string = questionDisplay;

  if (inputType === "audio") {
    console.log(`  [Realtime] Generating answer (audio input)...`);
    const result = await generateAnswerRealtime({
      prompt: testRun.prompt,
      context: contextData,
      questionText: testCase.questionText,
      questionAudioPath: testCase.questionAudioPath,
    });

    answer = result.answer;
    // For audio input, use the transcription as the question text for scoring
    questionForScoring = result.inputTranscript || questionDisplay;

    console.log(
      `  [Realtime] Answer generated: ${answer.length} chars in ${result.durationMs}ms`
    );
    if (result.inputTranscript) {
      console.log(`  [Realtime] Audio transcribed: "${result.inputTranscript.slice(0, 50)}..."`);
    }
  } else {
    if (selectedTextTransport === "realtime") {
      console.log(`  [Realtime] Generating answer (text input)...`);
      const result = await generateAnswerRealtime({
        prompt: testRun.prompt,
        context: contextData,
        questionText: testCase.questionText,
        questionAudioPath: null,
      });
      answer = result.answer;
      questionForScoring = testCase.questionText || questionDisplay;
      console.log(
        `  [Realtime] Answer generated: ${answer.length} chars in ${result.durationMs}ms`
      );
    } else {
      if (!testCase.questionText || !testCase.questionText.trim()) {
        throw new Error("Text test case is missing questionText");
      }

      console.log(`  [Vercel AI] Generating answer (text input)...`);
      const start = Date.now();
      answer = await generateAnswer({
        model: testRun.llmModel,
        prompt: testRun.prompt,
        question: testCase.questionText,
        context: contextData,
        temperature: testRun.temperature,
        topP: testRun.topP,
        topK: testRun.topK,
      });
      questionForScoring = testCase.questionText;
      console.log(`  [Vercel AI] Answer generated: ${answer.length} chars in ${Date.now() - start}ms`);
    }
  }

  // 2. Calculate all scores
  console.log(`  [Scoring] Calculating scores...`);
  const scores = await calculateScores({
    generatedAnswer: answer,
    expectedAnswer: testCase.expectedAnswer,
    question: questionForScoring,
    model: testRun.llmModel,
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
  }
): Promise<string> {
  // Create a new TestRun
  const testRun = await prisma.testRun.create({
    data: {
      suiteId,
      llmModel: params.llmModel,
      prompt: params.prompt,
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
    },
  });

  console.log(`[Worker] Created TestRun: ${testRun.id}`);

  // Process it
  await processTestRun(testRun.id);

  return testRun.id;
}
