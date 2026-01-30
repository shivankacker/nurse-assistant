/**
 * LLM Service - Provider Factory and Unified Interface
 *
 * Supports multiple LLM providers with BYOK (Bring Your Own Keys)
 * Model string format: "provider:model-id"
 *   - openai:gpt-4o
 *   - openai:gpt-4o-mini
 *   - anthropic:claude-sonnet-4-20250514
 *   - anthropic:claude-3-5-sonnet-20241022
 *   - google:gemini-1.5-pro
 *   - google:gemini-2.0-flash
 */
import { generateText, embed, type LanguageModel, type EmbeddingModel } from "ai";
import { getOpenAIModel, getOpenAIEmbeddingModel } from "./providers/openai";
import { getAnthropicModel } from "./providers/anthropic";
import { getGoogleModel, getGoogleEmbeddingModel } from "./providers/google";
import type { LLMGenerateParams, ModelConfig, ProviderName } from "../../types";

/**
 * Parse model string into provider and model ID
 * Format: "provider:model-id"
 */
export function parseModelString(modelString: string): ModelConfig {
  const colonIndex = modelString.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(
      `Invalid model format: "${modelString}". Expected "provider:model-id" (e.g., "openai:gpt-4o")`
    );
  }

  const provider = modelString.slice(0, colonIndex);
  const modelId = modelString.slice(colonIndex + 1);

  if (!provider || !modelId) {
    throw new Error(
      `Invalid model format: "${modelString}". Provider and model ID are required.`
    );
  }

  const validProviders: ProviderName[] = ["openai", "anthropic", "google"];
  if (!validProviders.includes(provider as ProviderName)) {
    throw new Error(
      `Unsupported provider: "${provider}". Supported: ${validProviders.join(", ")}`
    );
  }

  return {
    provider: provider as ProviderName,
    modelId,
  };
}

/**
 * Get API key for a provider from environment variables
 */
function getApiKey(provider: ProviderName): string {
  const envMap: Record<ProviderName, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_AI_API_KEY",
  };

  const envVar = envMap[provider];
  const key = process.env[envVar];

  if (!key) {
    throw new Error(
      `API key not found for provider "${provider}". Please set ${envVar} in your .env file.`
    );
  }

  return key;
}

/**
 * Get a language model instance for the given config
 */
export function getModel(config: ModelConfig): LanguageModel {
  const apiKey = getApiKey(config.provider);

  switch (config.provider) {
    case "openai":
      return getOpenAIModel(config.modelId, apiKey);
    case "anthropic":
      return getAnthropicModel(config.modelId, apiKey);
    case "google":
      return getGoogleModel(config.modelId, apiKey);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Get an embedding model instance
 * Currently supports OpenAI and Google embeddings
 */
export function getEmbeddingModel(modelString: string): EmbeddingModel {
  const config = parseModelString(modelString);
  const apiKey = getApiKey(config.provider);

  switch (config.provider) {
    case "openai":
      return getOpenAIEmbeddingModel(config.modelId, apiKey);
    case "google":
      return getGoogleEmbeddingModel(config.modelId, apiKey);
    default:
      throw new Error(
        `Embedding not supported for provider: ${config.provider}. Use openai or google.`
      );
  }
}

/**
 * Build the full prompt combining system prompt, context, and question
 */
function buildPrompt(systemPrompt: string, question: string, context: string): string {
  const parts: string[] = [];

  // Add system prompt
  if (systemPrompt) {
    parts.push(systemPrompt);
  }

  // Add context if available
  if (context && context.trim()) {
    parts.push(`\n--- Context ---\n${context}`);
  }

  // Add question
  parts.push(`\n--- Question ---\n${question}`);

  // Add answer prompt
  parts.push(`\n--- Answer ---`);

  return parts.join("\n");
}

/**
 * Generate an answer using the specified LLM
 */
export async function generateAnswer(params: LLMGenerateParams): Promise<string> {
  const {
    model: modelString,
    prompt,
    question,
    context,
    temperature,
    topP,
    topK,
  } = params;

  const config = parseModelString(modelString);
  const model = getModel(config);

  // Build the complete prompt
  const fullPrompt = buildPrompt(prompt, question, context);

  console.log(`[LLM] Generating answer with ${modelString}`);
  console.log(`[LLM] Temperature: ${temperature}, TopP: ${topP}, TopK: ${topK}`);

  try {
    const { text } = await generateText({
      model,
      prompt: fullPrompt,
      temperature,
      topP,
      // topK is provider-specific (mainly Google)
      ...(config.provider === "google" && { topK }),
    });

    console.log(`[LLM] Generated ${text.length} characters`);
    return text;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[LLM] Generation failed: ${errorMessage}`);
    throw new Error(`LLM generation failed: ${errorMessage}`);
  }
}

/**
 * Generate embeddings for text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddingModelString =
    process.env.EMBEDDING_MODEL || "openai:text-embedding-3-small";

  const model = getEmbeddingModel(embeddingModelString);

  try {
    const { embedding } = await embed({
      model,
      value: text,
    });

    return embedding;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Embedding] Generation failed: ${errorMessage}`);
    throw new Error(`Embedding generation failed: ${errorMessage}`);
  }
}

/**
 * Audio generation parameters
 */
export type AudioGenerateParams = {
  audioBase64: string;
  audioFormat: "wav" | "mp3" | "m4a" | "flac" | "ogg";
  prompt: string;
  context: string;
  temperature: number;
  topP: number;
};

/**
 * Generate an answer from audio input using multimodal LLM
 *
 * Uses OpenAI's audio-capable models (gpt-4o-audio-preview or similar)
 * to process audio directly without transcription.
 */
export async function generateAnswerWithAudio(
  params: AudioGenerateParams
): Promise<string> {
  const { audioBase64, audioFormat, prompt, context, temperature, topP } = params;

  // Get audio model from env or default
  const audioModelString = process.env.AUDIO_MODEL || "openai:gpt-4o-audio-preview";
  const config = parseModelString(audioModelString);

  if (config.provider !== "openai") {
    throw new Error(
      `Audio input is currently only supported with OpenAI models. Got: ${config.provider}`
    );
  }

  const model = getModel(config);

  // Build text context
  const textContent = context
    ? `${prompt}\n\n--- Context ---\n${context}\n\n--- Audio Question ---\nPlease listen to the audio and answer the question based on the context above.`
    : `${prompt}\n\n--- Audio Question ---\nPlease listen to the audio and answer the question.`;

  // Get MIME type for audio format
  const mimeTypes: Record<string, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    flac: "audio/flac",
    ogg: "audio/ogg",
  };

  console.log(`[LLM] Generating answer from audio with ${audioModelString}`);
  console.log(`[LLM] Audio format: ${audioFormat}, Temperature: ${temperature}`);

  try {
    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: textContent },
            {
              type: "file",
              mediaType: mimeTypes[audioFormat],
              data: Buffer.from(audioBase64, "base64"),
            },
          ],
        },
      ],
      temperature,
      topP,
    });

    console.log(`[LLM] Generated ${text.length} characters from audio`);
    return text;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[LLM] Audio generation failed: ${errorMessage}`);
    throw new Error(`Audio LLM generation failed: ${errorMessage}`);
  }
}
