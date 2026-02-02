/**
 * WebSocket Service for OpenAI Realtime API
 *
 * Manages WebSocket connections to OpenAI's Realtime API for server-side use.
 * Handles session configuration, message sending, and response collection.
 */

import WebSocket from "ws";
import { getRealtimeToken } from "./token";

const REALTIME_API_URL = "wss://api.openai.com/v1/realtime";
const CONNECTION_TIMEOUT = 30000; // 30 seconds
const RESPONSE_TIMEOUT = 60000; // 60 seconds for response

export interface SessionConfig {
  instructions: string;
  context?: string;
  voice?: string;
}

export interface RealtimeResponse {
  text: string;
  responseId: string;
  inputTranscript?: string;
}

type RealtimeEvent = {
  type: string;
  [key: string]: any;
};

/**
 * Create a configured WebSocket connection to OpenAI Realtime API
 */
export async function createRealtimeConnection(config: SessionConfig): Promise<RealtimeWebSocket> {
  const token = await getRealtimeToken();
  const model = process.env.REALTIME_MODEL || "gpt-realtime";
  const url = `${REALTIME_API_URL}?model=${model}`;

  console.log(`[Realtime WS] Connecting to ${url}`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, ["realtime", `openai-insecure-api-key.${token.token}`]);

    const connectionTimeout = setTimeout(() => {
      ws.close();
      reject(new Error("Connection timeout"));
    }, CONNECTION_TIMEOUT);

    ws.on("open", () => {
      clearTimeout(connectionTimeout);
      console.log("[Realtime WS] Connected");

      const realtimeWs = new RealtimeWebSocket(ws, config);
      resolve(realtimeWs);
    });

    ws.on("error", (error) => {
      clearTimeout(connectionTimeout);
      console.error("[Realtime WS] Connection error:", error);
      reject(error);
    });
  });
}

/**
 * Wrapper class for managing Realtime API WebSocket interactions
 */
export class RealtimeWebSocket {
  private ws: WebSocket;
  private config: SessionConfig;
  private responseText: string = "";
  private inputTranscript: string = "";
  private currentResponseId: string | null = null;
  private isSessionConfigured: boolean = false;

  constructor(ws: WebSocket, config: SessionConfig) {
    this.ws = ws;
    this.config = config;
  }

  /**
   * Configure the session with instructions and audio settings
   */
  async configureSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      const fullInstructions = this.config.context
        ? `${this.config.instructions}\n\nContext Information:\n${this.config.context}`
        : this.config.instructions;

      const sessionConfig = {
        type: "session.update",
        session: {
          type: "realtime",
          audio: {
            input: {
              format: {
                type: "audio/pcm",
                rate: 24000,
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 1500, // Shorter for eval (faster response)
              },
            },
            output: {
              format: {
                type: "audio/pcm",
                rate: 24000,
              },
              voice: this.config.voice || "ballad",
            },
          },
          instructions: fullInstructions,
        },
      };

      const onMessage = (data: WebSocket.RawData) => {
        const event = JSON.parse(data.toString()) as RealtimeEvent;
        if (event.type === "session.updated" || event.type === "session.created") {
          this.ws.off("message", onMessage);
          this.isSessionConfigured = true;
          console.log("[Realtime WS] Session configured");
          resolve();
        } else if (event.type === "error") {
          this.ws.off("message", onMessage);
          reject(new Error(event.error?.message || "Session configuration failed"));
        }
      };

      this.ws.on("message", onMessage);
      this.send(sessionConfig);

      // Timeout for session configuration
      setTimeout(() => {
        this.ws.off("message", onMessage);
        if (!this.isSessionConfigured) {
          reject(new Error("Session configuration timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Send a text message and get the response
   */
  async sendTextMessage(text: string): Promise<RealtimeResponse> {
    if (!this.isSessionConfigured) {
      await this.configureSession();
    }

    console.log(`[Realtime WS] Sending text message: "${text.slice(0, 50)}..."`);

    this.responseText = "";
    this.currentResponseId = null;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ws.off("message", onMessage);
        reject(new Error("Response timeout"));
      }, RESPONSE_TIMEOUT);

      const onMessage = (data: WebSocket.RawData) => {
        const event = JSON.parse(data.toString()) as RealtimeEvent;
        this.handleEvent(event);

        if (event.type === "response.done") {
          clearTimeout(timeout);
          this.ws.off("message", onMessage);
          resolve({
            text: this.responseText,
            responseId: this.currentResponseId || "unknown",
          });
        } else if (event.type === "error") {
          clearTimeout(timeout);
          this.ws.off("message", onMessage);
          reject(new Error(event.error?.message || "Response error"));
        }
      };

      this.ws.on("message", onMessage);

      // Send the text message
      this.send({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: text,
            },
          ],
        },
      });

      // Request text response (not audio for eval)
      this.send({
        type: "response.create",
        response: {
          output_modalities: ["text"],
        },
      });
    });
  }

  /**
   * Stream audio chunks and get the response
   */
  async streamAudio(chunks: Iterable<{ base64: string; isLast: boolean }>): Promise<RealtimeResponse> {
    if (!this.isSessionConfigured) {
      await this.configureSession();
    }

    console.log("[Realtime WS] Streaming audio...");

    this.responseText = "";
    this.inputTranscript = "";
    this.currentResponseId = null;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ws.off("message", onMessage);
        reject(new Error("Response timeout"));
      }, RESPONSE_TIMEOUT);

      const onMessage = (data: WebSocket.RawData) => {
        const event = JSON.parse(data.toString()) as RealtimeEvent;
        this.handleEvent(event);

        if (event.type === "response.done") {
          clearTimeout(timeout);
          this.ws.off("message", onMessage);
          resolve({
            text: this.responseText,
            responseId: this.currentResponseId || "unknown",
            inputTranscript: this.inputTranscript,
          });
        } else if (event.type === "error") {
          clearTimeout(timeout);
          this.ws.off("message", onMessage);
          reject(new Error(event.error?.message || "Response error"));
        }
      };

      this.ws.on("message", onMessage);

      // Stream all audio chunks
      let chunkCount = 0;
      for (const chunk of chunks) {
        this.send({
          type: "input_audio_buffer.append",
          audio: chunk.base64,
        });
        chunkCount++;
      }

      console.log(`[Realtime WS] Streamed ${chunkCount} audio chunks`);

      // Commit the audio buffer to trigger processing
      this.send({
        type: "input_audio_buffer.commit",
      });

      // Request text response
      this.send({
        type: "response.create",
        response: {
          output_modalities: ["text"],
        },
      });
    });
  }

  /**
   * Handle incoming events from the Realtime API
   */
  private handleEvent(event: RealtimeEvent): void {
    switch (event.type) {
      case "response.created":
        this.currentResponseId = event.response?.id;
        console.log(`[Realtime WS] Response started: ${this.currentResponseId}`);
        break;

      case "response.output_text.delta":
        if (event.delta) {
          this.responseText += event.delta;
        }
        break;

      case "response.text.delta":
        if (event.delta) {
          this.responseText += event.delta;
        }
        break;

      case "response.audio_transcript.delta":
        if (event.delta) {
          this.responseText += event.delta;
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) {
          this.inputTranscript = event.transcript;
          console.log(`[Realtime WS] Input transcribed: "${event.transcript.slice(0, 50)}..."`);
        }
        break;

      case "response.output_text.done":
      case "response.text.done":
      case "response.audio_transcript.done":
        if (event.text) {
          this.responseText = event.text;
        }
        console.log(`[Realtime WS] Response text complete: ${this.responseText.length} chars`);
        break;

      case "response.done":
        console.log(`[Realtime WS] Response complete`);
        break;

      case "error":
        console.error(`[Realtime WS] Error: ${event.error?.message}`);
        break;

      default:
        // Log other events for debugging
        if (event.type.startsWith("response.") || event.type.startsWith("conversation.")) {
          console.log(`[Realtime WS] Event: ${event.type}`);
        }
    }
  }

  /**
   * Send a message to the WebSocket
   */
  private send(message: object): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("[Realtime WS] WebSocket not open, cannot send message");
    }
  }

  /**
   * Close the WebSocket connection
   */
  close(): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
      console.log("[Realtime WS] Connection closed");
    }
  }

  /**
   * Check if connection is open
   */
  isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }
}
