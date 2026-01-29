import { TestSuite } from "@/prisma/client";
import z from "zod";

export function testSuiteSerializer(suite: TestSuite) {
  return {
    id: suite.id,
    name: suite.name,
    createdAt: suite.createdAt,
    updatedAt: suite.updatedAt,
  };
}

export type TestSuiteSerialized = ReturnType<typeof testSuiteSerializer>;

export const testSuiteCreateSchema = z.object({
  name: z.string().min(1).max(255),
});

export type TestSuiteCreatePayload = z.infer<typeof testSuiteCreateSchema>;
