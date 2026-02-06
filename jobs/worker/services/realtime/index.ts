/**
 * Realtime API Service for Evaluation
 *
 * Provides answer generation using OpenAI's Realtime API with WebSocket streaming.
 * Supports both text and audio input, matching the main application's behavior.
 *
 * This enables evaluation of the same LLM pipeline used in production:
 * - Text questions: Sent as conversation items
 * - Audio questions: Streamed as PCM audio chunks
 * - Context: Injected into session instructions
 */

import { createRealtimeConnection, RealtimeWebSocket } from "./websocket";
import { loadAudioFile, chunkAudio, getAudioStats } from "./audio";

export interface RealtimeGenerateParams {
  /** System prompt / instructions */
  prompt: string;
  /** Context information (from PDFs, text files, etc.) */
  context: string;
  /** Text question (if no audio) */
  questionText?: string | null;
  /** Path to audio file (relative to public/) */
  questionAudioPath?: string | null;
  /** OpenAI Realtime model id (e.g. "gpt-realtime"). Comes from TestRun.llmModel when running a test. */
  realtimeModel?: string;
}

export interface RealtimeGenerateResult {
  /** Generated answer text */
  answer: string;
  /** Transcription of audio input (if audio was provided) */
  inputTranscript?: string;
  /** Input type used */
  inputType: "text" | "audio";
  /** Time taken in milliseconds */
  durationMs: number;
}

/**
 * Generate an answer using OpenAI Realtime API
 *
 * Matches the main application's realtime flow:
 * 1. Connect to Realtime API via WebSocket
 * 2. Configure session with instructions + context
 * 3. Send question (text or audio)
 * 4. Collect response text
 *
 * @param params - Generation parameters
 * @returns Generated answer with metadata
 */
export async function generateAnswerRealtime(
  params: RealtimeGenerateParams
): Promise<RealtimeGenerateResult> {
  const { prompt, context, questionText, questionAudioPath, realtimeModel } = params;
  const startTime = Date.now();

  // Determine input type
  const hasAudio = questionAudioPath && questionAudioPath.trim() !== "";
  const hasText = questionText && questionText.trim() !== "";

  if (!hasAudio && !hasText) {
    throw new Error("Either questionText or questionAudioPath must be provided");
  }

  console.log(`[Realtime] Generating answer via Realtime API`);
  console.log(`[Realtime] Input type: ${hasAudio ? "audio" : "text"}`);
  console.log(`[Realtime] Context length: ${context.length} chars`);

  let connection: RealtimeWebSocket | null = null;

  try {
    // Create and configure connection (model from test run when provided)
    connection = await createRealtimeConnection({
      instructions: prompt,
      context: context,
      model: realtimeModel ?? "gpt-realtime",
    });

    await connection.configureSession();

    let result: RealtimeGenerateResult;

    if (hasAudio) {
      // Audio input flow
      console.log(`[Realtime] Loading audio file: ${questionAudioPath}`);
      const audioData = await loadAudioFile(questionAudioPath!);
      console.log(`[Realtime] Audio loaded: ${getAudioStats(audioData)}`);

      // Stream audio and get response
      const response = await connection.streamAudio(chunkAudio(audioData));

      result = {
        answer: response.text,
        inputTranscript: response.inputTranscript,
        inputType: "audio",
        durationMs: Date.now() - startTime,
      };
    } else {
      // Text input flow
      const response = await connection.sendTextMessage(questionText!);

      result = {
        answer: response.text,
        inputType: "text",
        durationMs: Date.now() - startTime,
      };
    }

    console.log(`[Realtime] Answer generated: ${result.answer.length} chars in ${result.durationMs}ms`);

    return result;
  } finally {
    // Always close the connection
    if (connection) {
      connection.close();
    }
  }
}

/**
 * Check if Realtime API is available and configured
 */
export async function checkRealtimeAvailability(): Promise<{
  available: boolean;
  error?: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { available: false, error: "OPENAI_API_KEY not set" };
  }

  try {
    // Try to get a token (validates API key and access)
    const { getRealtimeToken } = await import("./token");
    await getRealtimeToken();
    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Re-export types and utilities
export { loadAudioFile, chunkAudio, getAudioStats } from "./audio";
export { getRealtimeToken } from "./token";
export type { AudioData, AudioChunk } from "./audio";
export type { RealtimeToken } from "./token";
export type { SessionConfig, RealtimeResponse } from "./websocket";
