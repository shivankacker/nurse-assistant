import { TestCase, TestSuite, TestRun, TestRunResult } from "@/prisma/client";
import z from "zod";

// ============================================================================
// Test Case Schemas
// ============================================================================

export function testCaseSerializer(testCase: TestCase) {
  return {
    id: testCase.id,
    questionText: testCase.questionText,
    questionAudioPath: testCase.questionAudioPath,
    questionImagePath: testCase.questionImagePath,
    expectedAnswer: testCase.expectedAnswer,
    testSuiteId: testCase.testSuiteId,
    createdAt: testCase.createdAt,
    updatedAt: testCase.updatedAt,
  };
}

export type TestCaseSerialized = ReturnType<typeof testCaseSerializer>;

export const testCaseCreateSchema = z
  .object({
    expectedAnswer: z.string().min(1),
  })
  .and(
    z.union([
      z.object({ questionText: z.string().min(1) }),
      z.object({ questionAudioPath: z.string().min(1) }),
      z.object({ questionImagePath: z.string().min(1) }),
    ]),
  );

export type TestCaseCreatePayload = z.infer<typeof testCaseCreateSchema>;

// ============================================================================
// Test Suite Schemas
// ============================================================================

export function testSuiteSerializer(
  suite: TestSuite & { testCases: TestCase[] },
) {
  return {
    id: suite.id,
    name: suite.name,
    createdAt: suite.createdAt,
    updatedAt: suite.updatedAt,
    testCases: suite.testCases.map(testCaseSerializer),
  };
}

export type TestSuiteSerialized = ReturnType<typeof testSuiteSerializer>;

export const testSuiteCreateSchema = z.object({
  name: z.string().min(1).max(255),
});

export type TestSuiteCreatePayload = z.infer<typeof testSuiteCreateSchema>;

// ============================================================================
// Test Run Schemas
// ============================================================================

/**
 * Schema for creating a new test run
 * Model format: "provider:model-id" (e.g., "openai:gpt-4o", "anthropic:claude-sonnet-4-20250514")
 */
export const testRunCreateSchema = z.object({
  llmModel: z
    .string()
    .min(1)
    .regex(
      /^(openai|anthropic|google):.+$/,
      'Model must be in format "provider:model-id" (e.g., "openai:gpt-4o")'
    ),
  prompt: z.string().min(1).max(10000),
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).default(1),
  topK: z.number().int().min(1).max(100).default(40),
});

export type TestRunCreatePayload = z.infer<typeof testRunCreateSchema>;

export function testRunSerializer(run: TestRun) {
  return {
    id: run.id,
    suiteId: run.suiteId,
    llmModel: run.llmModel,
    temperature: run.temperature,
    topP: run.topP,
    topK: run.topK,
    prompt: run.prompt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  };
}

export type TestRunSerialized = ReturnType<typeof testRunSerializer>;

// ============================================================================
// Test Run Result Schemas
// ============================================================================

export function testRunResultSerializer(result: TestRunResult) {
  return {
    id: result.id,
    runId: result.runId,
    caseId: result.caseId,
    status: result.status,
    failReason: result.failReason,
    answer: result.answer,
    bleuScore: result.bleuScore,
    cosineSimScore: result.cosineSimScore,
    llmScore: result.llmScore,
    llmScoreReason: result.llmScoreReason,
    createdAt: result.createdAt,
  };
}

export type TestRunResultSerialized = ReturnType<typeof testRunResultSerializer>;
