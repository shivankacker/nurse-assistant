import { Context, TestCase, TestSuite } from "@/prisma/client";
import z from "zod";

export function contextSerializer(context: Context) {
  return {
    id: context.id,
    name: context.name,
    text: context.text,
    filePath: context.filePath,
  };
}

export type ContextSerialized = ReturnType<typeof contextSerializer>;

export const contextCreateSchema = z.object({
  name: z.string().min(1).max(255),
  text: z.string().optional(),
  filePath: z.string().optional(),
});

export type ContextCreatePayload = z.infer<typeof contextCreateSchema>;
