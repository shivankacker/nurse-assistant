import { Context, TestCase, TestSuite } from "@/prisma/client";
import z from "zod";
import { contextSerializer } from "./context";

export function testCaseSerializer(testCase: TestCase) {
  return {
    id: testCase.id,
    questionText: testCase.questionText,
    questionAudioPath: testCase.questionAudioPath,
    questionImagePath: testCase.questionImagePath,
    expectedAnswer: testCase.expectedAnswer,
    createdAt: testCase.createdAt,
    updatedAt: testCase.updatedAt,
  };
}

export type TestCaseSerialized = ReturnType<typeof testCaseSerializer>;

export function testSuiteSerializer(
  suite: TestSuite & { testCases: TestCase[]; contexts: Context[] },
) {
  return {
    id: suite.id,
    name: suite.name,
    createdAt: suite.createdAt,
    updatedAt: suite.updatedAt,
    testCases: suite.testCases.map(testCaseSerializer),
    contexts: suite.contexts.map(contextSerializer),
  };
}

export type TestSuiteSerialized = ReturnType<typeof testSuiteSerializer>;

export const testSuiteCreateSchema = z.object({
  name: z.string().min(1).max(255),
});

export type TestSuiteCreatePayload = z.infer<typeof testSuiteCreateSchema>;

export const testSuiteUpdateSchema = testSuiteCreateSchema.extend({
  contextIds: z.array(z.cuid()),
});

export type TestSuiteUpdatePayload = z.infer<typeof testSuiteUpdateSchema>;

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
