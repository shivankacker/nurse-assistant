"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";

interface RealtimeClientProps {
  projectId: string;
  contextTexts: string[];
  prompt: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function RealtimeClient({
  projectId,
  contextTexts,
  prompt,
}: RealtimeClientProps) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);
  const activeResponseRef = useRef<string | null>(null);
  const currentTranscriptRef = useRef<string>("");

  useEffect(() => {
    // Initialize audio context
    audioContextRef.current = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    audioPlayerRef.current = new Audio();

    return () => {
      disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const connect = async () => {
    try {
      setError(null);

      // Request microphone access first
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Resume audio context if suspended
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }

      // Get ephemeral token
      const tokenResponse = await fetch("/api/realtime/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to get authentication token");
      }

      const { token } = await tokenResponse.json();

      // Connect to OpenAI Realtime API
      const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";
      const ws = new WebSocket(url, [
        "realtime",
        `openai-insecure-api-key.${token}`,
      ]);

      wsRef.current = ws;

      ws.addEventListener("open", () => {
        console.log("Connected to Realtime API");
        setConnected(true);

        // Configure session with context
        const contextInstruction =
          contextTexts.length > 0
            ? `\n\nContext Information:\n${contextTexts.join("\n\n")}`
            : "";

        const fullInstructions = `${prompt}${contextInstruction}`;

        ws.send(
          JSON.stringify({
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
                    silence_duration_ms: 2000,
                  },
                },
                output: {
                  format: {
                    type: "audio/pcm",
                    rate: 24000,
                  },
                  voice: "ballad",
                },
              },
              instructions: fullInstructions,
            },
          }),
        );

        // Start streaming audio after session is configured
        streamAudio(stream, ws);
      });

      ws.addEventListener("message", async (event) => {
        const serverEvent = JSON.parse(event.data);
        handleServerEvent(serverEvent);
      });

      ws.addEventListener("error", (error) => {
        console.error("WebSocket error:", error);
        setError("Connection error occurred");
      });

      ws.addEventListener("close", () => {
        console.log("Disconnected from Realtime API");
        setConnected(false);
      });

      setIsRecording(true);
    } catch (err) {
      console.error("Connection error:", err);
      setError(err instanceof Error ? err.message : "Failed to connect");
      setConnected(false);

      // Clean up stream if connection failed
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    // Stop all queued audio
    audioQueueRef.current.forEach((source) => {
      try {
        source.stop();
      } catch (e) {
        // Ignore if already stopped
      }
    });
    audioQueueRef.current = [];
    nextPlayTimeRef.current = 0;
    activeResponseRef.current = null;
    currentTranscriptRef.current = "";
    setConnected(false);
    setIsRecording(false);
  };

  const handleServerEvent = async (event: any) => {
    console.log("Server event:", event.type, event);

    // Handle error events
    if (event.type === "error") {
      let errorMessage = "An error occurred";

      if (event.error) {
        if (event.error.code === "insufficient_quota") {
          errorMessage =
            "OpenAI API quota exceeded. Please check your billing settings at platform.openai.com.";
        } else if (event.error.code === "rate_limit_error") {
          errorMessage = "Rate limit exceeded. Please try again in a moment.";
        } else if (event.error.code === "invalid_request_error") {
          errorMessage = `Invalid request: ${event.error.message}`;
        } else {
          errorMessage = event.error.message || errorMessage;
        }
      }

      setError(errorMessage);
      console.error("Server error:", event.error);
      return;
    }

    switch (event.type) {
      case "session.created":
      case "session.updated":
        console.log("Session configured");
        break;

      case "response.created":
        activeResponseRef.current = event.response?.id || null;
        currentTranscriptRef.current = "";
        break;

      case "response.output_text.delta":
        // Handle streaming text response
        break;

      case "response.output_text.done":
        // Add complete text message
        if (event.text) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: event.text,
              timestamp: new Date(),
            },
          ]);
        }
        break;

      case "response.output_audio_transcript.delta":
        // Accumulate transcript as it streams
        if (event.delta) {
          currentTranscriptRef.current += event.delta;
        }
        break;

      case "response.output_audio_transcript.done":
        // Audio transcription complete - use accumulated transcript
        const transcript = event.transcript || currentTranscriptRef.current;
        if (transcript) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: transcript,
              timestamp: new Date(),
            },
          ]);
        }
        currentTranscriptRef.current = "";
        break;

      case "response.output_audio.delta":
        // Play audio chunk
        if (event.delta) {
          setIsSpeaking(true);
          await playAudioChunk(event.delta);
        }
        break;

      case "response.output_audio.done":
        setIsSpeaking(false);
        // Reset the play time for the next response
        if (audioContextRef.current) {
          nextPlayTimeRef.current = audioContextRef.current.currentTime;
        }
        break;

      case "response.done":
        // Check if response failed
        if (event.response?.status === "failed") {
          const errorDetails = event.response?.status_details?.error;
          let errorMessage = "AI response failed";

          if (errorDetails) {
            if (errorDetails.code === "insufficient_quota") {
              errorMessage =
                "OpenAI API quota exceeded. Please check your billing settings.";
            } else if (errorDetails.code === "rate_limit_error") {
              errorMessage =
                "Rate limit exceeded. Please try again in a moment.";
            } else {
              errorMessage = errorDetails.message || errorMessage;
            }
          }

          setError(errorMessage);
          console.error("Response failed:", errorDetails);
        }
        activeResponseRef.current = null;
        break;

      case "response.cancelled":
        console.log("Response cancelled");
        activeResponseRef.current = null;
        setIsSpeaking(false);
        // Clear any accumulated transcript
        currentTranscriptRef.current = "";
        // Clear audio queue
        audioQueueRef.current.forEach((source) => {
          try {
            source.stop();
          } catch (e) {
            // Ignore
          }
        });
        audioQueueRef.current = [];
        if (audioContextRef.current) {
          nextPlayTimeRef.current = audioContextRef.current.currentTime;
        }
        break;

      case "input_audio_buffer.committed":
        console.log("Audio committed");
        // Trigger a response after audio is committed
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "response.create",
              response: {
                output_modalities: ["audio"], // Audio automatically includes text transcript
              },
            }),
          );
        }
        break;

      case "input_audio_buffer.speech_started":
        console.log("Speech started - user speaking");

        // Interrupt any ongoing AI response only if AI is actually speaking
        if (
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN &&
          activeResponseRef.current &&
          isSpeaking
        ) {
          console.log("Cancelling active response:", activeResponseRef.current);

          // Immediately stop speaking state to prevent new audio chunks
          setIsSpeaking(false);

          // Cancel the current response
          wsRef.current.send(JSON.stringify({ type: "response.cancel" }));

          // Stop all queued audio immediately
          audioQueueRef.current.forEach((source) => {
            try {
              source.stop();
            } catch (e) {
              // Ignore if already stopped
            }
          });
          audioQueueRef.current = [];

          // Reset play time to current time to avoid scheduling issues
          if (audioContextRef.current) {
            nextPlayTimeRef.current = audioContextRef.current.currentTime;
          }

          // Clear any partial transcript
          currentTranscriptRef.current = "";
        }
        break;

      case "input_audio_buffer.speech_stopped":
        console.log("Speech stopped - user finished");
        break;

      case "conversation.item.input_audio_transcription.completed":
        // User's speech was transcribed
        if (event.transcript) {
          console.log("User said:", event.transcript);
          setMessages((prev) => [
            ...prev,
            {
              role: "user",
              content: event.transcript,
              timestamp: new Date(),
            },
          ]);
        }
        break;

      case "conversation.item.input_audio_transcription.failed":
        // Transcription failed (e.g., rate limit) - just log it, don't crash
        console.warn("Input transcription failed:", event.error?.message);
        break;

      case "error":
        console.error("Server error:", event);
        setError(event.error?.message || "Unknown error");
        break;
    }
  };

  const streamAudio = async (stream: MediaStream, ws: WebSocket) => {
    if (!audioContextRef.current) return;

    const audioContext = audioContextRef.current;
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (!isMuted && ws.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = floatTo16BitPCM(inputData);
        const base64Audio = arrayBufferToBase64(pcm16);

        ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64Audio,
          }),
        );
      }
    };
  };

  const floatTo16BitPCM = (float32Array: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const playAudioChunk = async (base64Audio: string) => {
    if (!audioContextRef.current) return;

    try {
      const audioData = base64ToArrayBuffer(base64Audio);

      // Convert PCM16 to Float32Array for Web Audio API
      const pcm16 = new Int16Array(audioData);
      const float32 = new Float32Array(pcm16.length);

      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0; // Convert to -1.0 to 1.0 range
      }

      // Create an audio buffer
      const audioBuffer = audioContextRef.current.createBuffer(
        1, // mono
        float32.length,
        24000, // sample rate
      );

      audioBuffer.getChannelData(0).set(float32);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      // Schedule the audio to play after the previous chunk
      const currentTime = audioContextRef.current.currentTime;
      const startTime = Math.max(currentTime, nextPlayTimeRef.current);

      source.start(startTime);

      // Update next play time
      nextPlayTimeRef.current = startTime + audioBuffer.duration;

      // Clean up when done
      source.onended = () => {
        const index = audioQueueRef.current.indexOf(source);
        if (index > -1) {
          audioQueueRef.current.splice(index, 1);
        }
      };

      audioQueueRef.current.push(source);
    } catch (err) {
      console.error("Error playing audio:", err);
    }
  };

  const sendTextMessage = () => {
    if (!wsRef.current || !inputText.trim()) return;

    const message = inputText.trim();
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: message,
        timestamp: new Date(),
      },
    ]);

    wsRef.current.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: message,
            },
          ],
        },
      }),
    );

    wsRef.current.send(
      JSON.stringify({
        type: "response.create",
        response: {
          output_modalities: ["audio"],
        },
      }),
    );

    setInputText("");
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {error && (
        <Card className="border-red-500 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-red-600 font-semibold mb-1">Error</p>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="text-red-600 hover:text-red-700 hover:bg-red-100"
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Realtime Voice & Text Chat</span>
            <div className="flex gap-2">
              {connected && (
                <>
                  <Button
                    variant={isMuted ? "destructive" : "outline"}
                    size="sm"
                    onClick={toggleMute}
                  >
                    {isMuted ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </Button>
                  {isSpeaking && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Volume2 className="h-4 w-4 animate-pulse" />
                      <span>Speaking...</span>
                    </div>
                  )}
                </>
              )}
              <Button
                variant={connected ? "destructive" : "default"}
                size="sm"
                onClick={connected ? disconnect : connect}
              >
                {connected ? "Disconnect" : "Connect"}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Messages */}
            <div className="h-[400px] overflow-y-auto border rounded-lg p-4 space-y-4">
              {messages.length === 0 ? (
                <p className="text-muted-foreground text-center">
                  {connected
                    ? "Start talking or type a message..."
                    : "Connect to start chatting"}
                </p>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {msg.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Text Input */}
            <div className="flex gap-2">
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  connected ? "Type a message..." : "Connect to send messages"
                }
                disabled={!connected}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendTextMessage();
                  }
                }}
                className="resize-none"
                rows={2}
              />
              <Button
                onClick={sendTextMessage}
                disabled={!connected || !inputText.trim()}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
