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
  text: z.string().min(1),
  filePath: z.string().min(1),
});

export type ContextCreatePayload = z.infer<typeof contextCreateSchema>;
