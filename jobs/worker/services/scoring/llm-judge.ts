/**
 * LLM-as-Judge Scoring
 *
 * Uses an LLM to evaluate the quality of generated answers
 * against expected answers. Provides a score (0-1) and reasoning.
 *
 * Evaluation criteria:
 * - Factual accuracy
 * - Completeness
 * - Relevance
 * - Coherence
 */
import { generateObject } from "ai";
import { z } from "zod";
import { parseModelString, getModel } from "../llm";

export type LlmJudgeResult = {
  score: number; // 0-1 scale
  reason: string; // Explanation for the score
};

/**
 * Zod schema for structured LLM judge response
 */
const llmJudgeResponseSchema = z.object({
  score: z.number().min(0).max(1).describe("Overall score between 0.0 and 1.0"),
  breakdown: z.object({
    accuracy: z.number().min(0).max(1).describe("Factual accuracy score 0.0-1.0"),
    completeness: z.number().min(0).max(1).describe("Completeness score 0.0-1.0"),
    relevance: z.number().min(0).max(1).describe("Relevance score 0.0-1.0"),
    coherence: z.number().min(0).max(1).describe("Coherence score 0.0-1.0"),
  }).describe("Breakdown of scores by criteria"),
  reason: z.string().describe("2-3 sentence explanation of the score"),
});

/**
 * Judge prompt template (without JSON format instructions - handled by structured output)
 * Includes context so the judge can evaluate if the answer correctly uses available information
 */
const JUDGE_PROMPT = `You are an expert evaluator assessing the quality of AI-generated answers.

Your task is to compare a GENERATED ANSWER against an EXPECTED ANSWER for a given QUESTION.
The AI had access to the CONTEXT below when generating its answer.

Evaluate based on these criteria:
1. **Factual Accuracy**: Does the generated answer contain correct information based on the context?
2. **Completeness**: Does it cover all key points from the expected answer?
3. **Relevance**: Does it directly address the question using the provided context?
4. **Coherence**: Is it well-structured and easy to understand?

---

CONTEXT (information available to the AI):
{context}

---

QUESTION:
{question}

---

EXPECTED ANSWER:
{expectedAnswer}

---

GENERATED ANSWER:
{generatedAnswer}

---

Scoring guide:
- 0.9-1.0: Excellent - Nearly identical or better than expected, correctly uses context
- 0.7-0.9: Good - Covers main points with minor gaps
- 0.5-0.7: Fair - Partially correct but missing key information from context
- 0.3-0.5: Poor - Significant errors or omissions, misuses context
- 0.0-0.3: Very Poor - Mostly incorrect, irrelevant, or ignores context`;

// Default judge system prompt (from env or hardcoded fallback)
const DEFAULT_JUDGE_PROMPT = process.env.LLM_JUDGE_PROMPT || JUDGE_PROMPT;

/**
 * Calculate LLM-as-judge score using structured output
 *
 * @param question - The original question
 * @param generatedAnswer - The LLM's generated answer
 * @param expectedAnswer - The expected/reference answer
 * @param context - The context that was available when generating the answer
 * @param options - Optional judge configuration (model and prompt)
 */
export async function calculateLlmJudgeScore(
  question: string,
  generatedAnswer: string,
  expectedAnswer: string,
  context: string,
  options?: {
    judgeModel?: string | null;
    judgePrompt?: string | null;
  }
): Promise<LlmJudgeResult> {
  // Use TestRun config if provided, otherwise fall back to env/defaults
  const modelString =
    options?.judgeModel || process.env.LLM_JUDGE_MODEL || "openai:gpt-4o-mini";

  const systemPrompt = options?.judgePrompt || DEFAULT_JUDGE_PROMPT;

  console.log(`[LLM-Judge] Using model: ${modelString}`);
  console.log(`[LLM-Judge] Context length: ${context.length} chars`);
  if (options?.judgePrompt) {
    console.log(`[LLM-Judge] Using custom prompt from TestRun`);
  }

  try {
    const config = parseModelString(modelString);
    const model = getModel(config);

    // Truncate context if too long (to avoid token limits)
    // Keep first 8000 chars which should be ~2000 tokens
    const truncatedContext = context.length > 8000 
      ? context.slice(0, 8000) + "\n\n[... context truncated for evaluation ...]"
      : context;

    // Build the evaluation prompt using the configured system prompt
    const prompt = systemPrompt
      .replace("{context}", truncatedContext || "[No context provided]")
      .replace("{question}", question)
      .replace("{expectedAnswer}", expectedAnswer)
      .replace("{generatedAnswer}", generatedAnswer);

    // Generate structured evaluation using Zod schema
    const { object } = await generateObject({
      model,
      schema: llmJudgeResponseSchema,
      prompt,
      temperature: 0.1, // Low temperature for consistent evaluation
    });

    // Clamp score to valid range (extra safety)
    const score = Math.max(0, Math.min(1, object.score));

    console.log(`[LLM-Judge] Score: ${score.toFixed(2)}`);

    return {
      score,
      reason: object.reason,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[LLM-Judge] Evaluation failed: ${errorMessage}`);

    // Return a fallback result
    return {
      score: 0.5,
      reason: `Evaluation failed: ${errorMessage}. Defaulting to neutral score.`,
    };
  }
}

/**
 * Batch evaluate multiple answers
 * More efficient for large test suites
 */
export async function batchCalculateLlmJudgeScores(
  evaluations: Array<{
    question: string;
    generatedAnswer: string;
    expectedAnswer: string;
    context: string;
  }>,
  options?: {
    judgeModel?: string | null;
    judgePrompt?: string | null;
  }
): Promise<LlmJudgeResult[]> {
  // Process in parallel with a limit
  const results = await Promise.all(
    evaluations.map(({ question, generatedAnswer, expectedAnswer, context }) =>
      calculateLlmJudgeScore(question, generatedAnswer, expectedAnswer, context, options)
    )
  );

  return results;
}
