/**
 * Realtime API Token Service
 *
 * Generates ephemeral tokens for authenticating with OpenAI's Realtime API.
 * Extracted from app/api/realtime/token/route.ts for server-side use in workers.
 */

export interface RealtimeToken {
  token: string;
  expiresAt?: string;
}

/**
 * Generate an ephemeral token for OpenAI Realtime API
 *
 * @param model - OpenAI Realtime model id (e.g. "gpt-realtime"). Defaults to "gpt-realtime".
 * @returns Token object with value and expiration
 * @throws Error if API key is missing or token generation fails
 */
export async function getRealtimeToken(model: string = "gpt-realtime"): Promise<RealtimeToken> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  console.log(`[Realtime Token] Generating ephemeral token for model: ${model}`);

  const response = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: model,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Realtime Token] OpenAI API error: ${response.status}`, errorText);
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.value) {
    console.error("[Realtime Token] No token value in response:", data);
    throw new Error("Invalid response from OpenAI API: no token value");
  }

  console.log(`[Realtime Token] Token generated, expires at: ${data.expires_at || "unknown"}`);

  return {
    token: data.value,
    expiresAt: data.expires_at,
  };
}
