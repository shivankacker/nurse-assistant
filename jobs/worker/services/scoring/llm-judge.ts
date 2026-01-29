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
import { generateText } from "ai";
import { parseModelString, getModel } from "../llm";

export type LlmJudgeResult = {
  score: number; // 0-1 scale
  reason: string; // Explanation for the score
};

/**
 * Judge prompt template
 * Designed to produce consistent, structured evaluations
 */
const JUDGE_PROMPT = `You are an expert evaluator assessing the quality of AI-generated answers.

Your task is to compare a GENERATED ANSWER against an EXPECTED ANSWER for a given QUESTION.

Evaluate based on these criteria:
1. **Factual Accuracy**: Does the generated answer contain correct information?
2. **Completeness**: Does it cover all key points from the expected answer?
3. **Relevance**: Does it directly address the question?
4. **Coherence**: Is it well-structured and easy to understand?

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

Provide your evaluation in the following JSON format ONLY (no other text):
{
  "score": <number between 0.0 and 1.0>,
  "breakdown": {
    "accuracy": <0.0-1.0>,
    "completeness": <0.0-1.0>,
    "relevance": <0.0-1.0>,
    "coherence": <0.0-1.0>
  },
  "reason": "<2-3 sentence explanation of the score>"
}

Scoring guide:
- 0.9-1.0: Excellent - Nearly identical or better than expected
- 0.7-0.9: Good - Covers main points with minor gaps
- 0.5-0.7: Fair - Partially correct but missing key information
- 0.3-0.5: Poor - Significant errors or omissions
- 0.0-0.3: Very Poor - Mostly incorrect or irrelevant`;

/**
 * Calculate LLM-as-judge score
 *
 * @param question - The original question
 * @param generatedAnswer - The LLM's generated answer
 * @param expectedAnswer - The expected/reference answer
 * @param judgeModel - Model to use for judging (defaults to env var or gpt-4o-mini)
 */
export async function calculateLlmJudgeScore(
  question: string,
  generatedAnswer: string,
  expectedAnswer: string,
  judgeModel?: string
): Promise<LlmJudgeResult> {
  // Determine which model to use for judging
  const modelString =
    judgeModel || process.env.LLM_JUDGE_MODEL || "openai:gpt-4o-mini";

  console.log(`[LLM-Judge] Using model: ${modelString}`);

  try {
    const config = parseModelString(modelString);
    const model = getModel(config);

    // Build the evaluation prompt
    const prompt = JUDGE_PROMPT.replace("{question}", question)
      .replace("{expectedAnswer}", expectedAnswer)
      .replace("{generatedAnswer}", generatedAnswer);

    // Generate evaluation
    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.1, // Low temperature for consistent evaluation
    });

    // Parse the JSON response
    return parseJudgeResponse(text);
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
 * Parse the LLM judge response
 * Handles various response formats and edge cases
 */
function parseJudgeResponse(text: string): LlmJudgeResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.warn("[LLM-Judge] No JSON found in response, extracting manually");
      return extractScoreFromText(text);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and extract score
    let score = parsed.score;

    // Handle various score formats
    if (typeof score === "string") {
      score = parseFloat(score);
    }

    if (typeof score !== "number" || isNaN(score)) {
      // Try to extract from breakdown if available
      if (parsed.breakdown) {
        const values = Object.values(parsed.breakdown).filter(
          (v): v is number => typeof v === "number"
        );
        if (values.length > 0) {
          score = values.reduce((a, b) => a + b, 0) / values.length;
        } else {
          score = 0.5;
        }
      } else {
        score = 0.5;
      }
    }

    // Clamp score to valid range
    score = Math.max(0, Math.min(1, score));

    // Extract reason
    const reason = parsed.reason || parsed.explanation || "No explanation provided";

    console.log(`[LLM-Judge] Score: ${score.toFixed(2)}`);

    return { score, reason };
  } catch (error) {
    console.warn(`[LLM-Judge] Failed to parse JSON: ${error}`);
    return extractScoreFromText(text);
  }
}

/**
 * Extract score from plain text if JSON parsing fails
 */
function extractScoreFromText(text: string): LlmJudgeResult {
  // Try to find a score pattern in the text
  const scorePatterns = [
    /score[:\s]+([0-9.]+)/i,
    /([0-9.]+)\s*\/\s*1/i,
    /([0-9.]+)\s*out of\s*1/i,
    /rating[:\s]+([0-9.]+)/i,
  ];

  for (const pattern of scorePatterns) {
    const match = text.match(pattern);
    if (match) {
      const score = parseFloat(match[1]);
      if (!isNaN(score) && score >= 0 && score <= 1) {
        return {
          score,
          reason: text.slice(0, 200), // Use first 200 chars as reason
        };
      }
    }
  }

  // Default fallback
  return {
    score: 0.5,
    reason: `Could not parse evaluation. Response: ${text.slice(0, 200)}`,
  };
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
  }>,
  judgeModel?: string
): Promise<LlmJudgeResult[]> {
  // Process in parallel with a limit
  const results = await Promise.all(
    evaluations.map(({ question, generatedAnswer, expectedAnswer }) =>
      calculateLlmJudgeScore(question, generatedAnswer, expectedAnswer, judgeModel)
    )
  );

  return results;
}
