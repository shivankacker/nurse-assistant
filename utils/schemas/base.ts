import { z } from "zod";

export const limitOffsetSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
});

export type LimitOffset = z.infer<typeof limitOffsetSchema>;

export const zodErrorSerializer = (error: z.ZodError) => {
  const errors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    for (const pathPart of issue.path) {
      const key = String(pathPart);
      (errors[key] ??= []).push(issue.message);
    }
  }

  return errors;
};

export type PaginatedResponse<T> = {
  limit: number;
  offset: number;
  hasMore: boolean;
  results: T[];
};
