import { TestCase, TestSuite } from "@/prisma/client";
import z from "zod";

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
