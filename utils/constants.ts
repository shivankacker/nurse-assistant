export type LlmTransport = "vercel" | "realtime";

export type LlmConfig = {
  name: string;
  /**
   * Which stack to use for TEXT generation.
   * - "vercel": Vercel AI SDK (provider:model-id)
   * - "realtime": OpenAI Realtime API
   *
   * Note: Audio always uses the Realtime API regardless of model selection.
   */
  textTransport: LlmTransport;
};

export const LLMS = {
  /**
   * Realtime models (text will be generated via Realtime API).
   * Key format is intentionally NOT provider:model-id, since it is not consumed
   * by the Vercel AI SDK factory.
   */
  "realtime:gpt-realtime": {
    name: "OpenAI Realtime (gpt-realtime)",
    textTransport: "realtime",
  },

  /**
   * Standard text models (generated via Vercel AI SDK using BYOK provider keys).
   * Key format: provider:model-id
   */
  "openai:gpt-5-mini-2025-08-07": {
    name: "GPT-5 Mini",
    textTransport: "vercel",
  },
  "openai:gpt-5.2-2025-12-11": {
    name: "GPT-5.2",
    textTransport: "vercel",
  },
} as const satisfies Record<string, LlmConfig>;
