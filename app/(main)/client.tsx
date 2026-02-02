"use client";

import { useEffect, useRef, useState } from "react";
import { ProjectSerialized } from "@/utils/schemas/project";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Mic,
  MicOff,
  Send,
  Loader2,
  AlertCircle,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ChatMessageSerialized, ChatSerialized } from "@/utils/schemas/chat";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { RealtimeAgent } from "@openai/agents/realtime";
import { RealtimeSession } from "@openai/agents/realtime";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function Client(props: {
  defaultProject: ProjectSerialized;
  existingChat?: ChatSerialized;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [chat, setChat] = useState<ChatSerialized | null>(
    props.existingChat || null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const agentRef = useRef<RealtimeAgent | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldCreateChatRef = useRef(false);
  const pendingMessagesRef = useRef<{ user: string; assistant: string }[]>([]);
  const streamingMessageRef = useRef<{
    itemId: string;
    content: string;
  } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load existing chat messages if provided
    if (props.existingChat?.messages) {
      const loadedMessages: Message[] = props.existingChat.messages.map(
        (msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          timestamp: new Date(msg.createdAt),
        }),
      );
      setMessages(loadedMessages);
    }

    return () => {
      disconnect();
    };
  }, []);

  const createChat = async () => {
    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: props.defaultProject.id }),
      });

      if (!response.ok) throw new Error("Failed to create chat");

      const newChat = await response.json();
      setChat(newChat);

      // Update URL silently without navigation
      window.history.pushState({}, "", `/chat/${newChat.id}`);

      // Invalidate chat list to refresh sidebar
      queryClient.invalidateQueries({ queryKey: ["chats"] });

      return newChat;
    } catch (err) {
      console.error("Error creating chat:", err);
      setError("Failed to create chat session");
      throw err;
    }
  };

  const saveMessage = async (role: "user" | "assistant", content: string) => {
    if (!chat) return;

    try {
      const response = await fetch("/api/chats/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          role,
          content,
          contextIds: [],
        }),
      });

      if (!response.ok) throw new Error("Failed to save message");

      const savedMessage = await response.json();
      return savedMessage;
    } catch (err) {
      console.error("Error saving message:", err);
    }
  };

  const connect = async (startMuted = false) => {
    try {
      setIsLoading(true);
      setError(null);

      // Mark that we should create chat after first AI response
      if (!chat) {
        shouldCreateChatRef.current = true;
      }

      // Get ephemeral token
      const tokenResponse = await fetch("/api/realtime/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: props.defaultProject.id }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to get token");
      }

      const { token } = await tokenResponse.json();

      // Build instructions with project context
      const contextTexts = props.defaultProject.contexts
        .map((c) => c.text)
        .join("\n\n");
      const instructions = `${props.defaultProject.prompt.content}\n\nContext:\n${contextTexts}`;

      // Create the agent
      const agent = new RealtimeAgent({
        name: "Assistant",
        instructions: instructions,
      });

      agentRef.current = agent;

      // Create session with WebRTC transport (auto-configured in browser)
      const session = new RealtimeSession(agent, {
        model: "gpt-realtime",
        transport: "webrtc", // SDK will auto-configure microphone and speakers
      });

      sessionRef.current = session;

      // Set up event listeners before connecting
      setupSessionListeners(session);

      // Connect to the session
      await session.connect({ apiKey: token });

      // Mute the microphone if requested
      if (startMuted) {
        session.mute(true);
        setIsMicMuted(true);
      }

      setIsConnected(true);
      setIsLoading(false);
    } catch (err) {
      console.error("Error connecting:", err);
      setError(
        err instanceof Error ? err.message : "Failed to connect to voice chat",
      );
      setIsLoading(false);
    }
  };

  const setupSessionListeners = (session: RealtimeSession) => {
    // Listen for streaming transcript deltas from transport layer (for assistant)
    session.transport.on("audio_transcript_delta", (deltaEvent) => {
      console.log("Transcript delta:", deltaEvent);

      // Initialize or update streaming message
      if (
        !streamingMessageRef.current ||
        streamingMessageRef.current.itemId !== deltaEvent.itemId
      ) {
        streamingMessageRef.current = {
          itemId: deltaEvent.itemId,
          content: deltaEvent.delta,
        };
      } else {
        streamingMessageRef.current.content += deltaEvent.delta;
      }

      // Update messages with streaming content
      setMessages((prev) => {
        const existing = prev.find((m) => m.id === deltaEvent.itemId);
        if (existing) {
          return prev.map((m) =>
            m.id === deltaEvent.itemId
              ? { ...m, content: streamingMessageRef.current!.content }
              : m,
          );
        } else {
          return [
            ...prev,
            {
              id: deltaEvent.itemId,
              role: "assistant",
              content: streamingMessageRef.current!.content,
              timestamp: new Date(),
            },
          ];
        }
      });
    });

    // Listen for user audio transcription completion
    session.transport.on(
      "conversation.item.input_audio_transcription.completed",
      (event: any) => {
        console.log("User transcription completed:", event);

        setMessages((prev) => {
          const existing = prev.find((m) => m.id === event.item_id);
          if (existing) {
            return prev.map((m) =>
              m.id === event.item_id ? { ...m, content: event.transcript } : m,
            );
          } else {
            return [
              ...prev,
              {
                id: event.item_id,
                role: "user",
                content: event.transcript,
                timestamp: new Date(),
              },
            ];
          }
        });
      },
    );

    // Listen for history updates - but don't overwrite streaming messages
    session.on("history_updated", (history) => {
      console.log("History updated:", history);

      // Convert history to messages for UI
      const newMessages: Message[] = [];

      history.forEach((item) => {
        if (item.type === "message") {
          // Extract text from content array
          const content = item.content
            .map((c) => {
              if ("text" in c) return c.text;
              if ("transcript" in c && c.transcript) return c.transcript;
              return "";
            })
            .filter(Boolean)
            .join(" ");

          if (content) {
            newMessages.push({
              id: item.itemId,
              role: item.role as "user" | "assistant",
              content,
              timestamp: new Date(),
            });
          }
        }
      });

      // Only update if we're not actively streaming, or merge with streaming content
      setMessages((prev) => {
        if (streamingMessageRef.current) {
          // If history has more content than we're currently streaming, update the streaming ref
          return newMessages.map((msg) => {
            if (msg.id === streamingMessageRef.current?.itemId) {
              // If the new content is longer, extend the streaming ref so animation continues
              if (
                msg.content.length > streamingMessageRef.current!.content.length
              ) {
                streamingMessageRef.current!.content = msg.content;
              }
              return { ...msg, content: streamingMessageRef.current.content };
            }
            return msg;
          });
        }
        return newMessages;
      });
    });

    // When agent ends, save the conversation
    session.on("agent_end", async (context, agent, output) => {
      console.log("Agent ended with output:", output);

      // Get the latest history to find user and assistant messages
      const history = session.history;
      let userText = "";
      let assistantText = output;

      // Find the last user message
      for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        if (item.type === "message" && item.role === "user") {
          const content = item.content
            .map((c) => {
              if ("text" in c) return c.text;
              if ("transcript" in c && c.transcript) return c.transcript;
              return "";
            })
            .filter(Boolean)
            .join(" ");
          userText = content;
          break;
        }
      }

      if (userText && assistantText) {
        await handleResponseComplete(userText, assistantText);
      }
    });

    // Listen for when assistant starts speaking
    session.on("audio_start", () => {
      console.log("Assistant started speaking");
      setIsSpeaking(true);
      // Clear previous streaming message
      streamingMessageRef.current = null;
    });

    // Listen for when assistant stops speaking
    session.on("audio_stopped", () => {
      console.log("Assistant stopped speaking");
      setIsSpeaking(false);
      // Clear streaming ref immediately when audio stops to stop pulsating
      setTimeout(() => {
        streamingMessageRef.current = null;
      }, 100);
    });

    // Listen for audio interruptions
    session.on("audio_interrupted", () => {
      console.log("Assistant was interrupted");
      setIsSpeaking(false);
    });

    // Handle errors
    session.on("error", (errorEvent) => {
      console.error("Session error:", errorEvent);
      setError(
        errorEvent.error instanceof Error
          ? errorEvent.error.message
          : "An error occurred",
      );
    });
  };

  const handleResponseComplete = async (
    userText: string,
    assistantText: string,
  ) => {
    // Create chat if needed
    if (shouldCreateChatRef.current && !chat) {
      try {
        const newChat = await createChat();
        shouldCreateChatRef.current = false;

        // Save both messages to the new chat
        if (newChat && userText && assistantText) {
          await saveMessage("user", userText);
          await saveMessage("assistant", assistantText);
        }
      } catch (err) {
        console.error("Error creating chat:", err);
      }
    } else if (chat) {
      // Save messages to existing chat
      if (userText) await saveMessage("user", userText);
      if (assistantText) await saveMessage("assistant", assistantText);
    }
  };

  const disconnect = () => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    agentRef.current = null;
    setIsConnected(false);
    setIsSpeaking(false);
    setIsMicMuted(false);
    setIsSpeakerMuted(false);
    setError(null);
  };

  const sendTextMessage = async () => {
    if (!inputText.trim()) return;

    const messageText = inputText.trim();
    setInputText("");

    try {
      // If not connected, connect first with muted mic
      if (!sessionRef.current) {
        await connect(true);
        // Wait a brief moment for session to be ready
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!sessionRef.current) {
        throw new Error("Failed to establish session");
      }

      // Send text message to the session
      sessionRef.current.sendMessage({
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: messageText,
          },
        ],
      });
    } catch (err) {
      console.error("Error sending message:", err);
      setError("Failed to send message");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const toggleMicMute = () => {
    if (sessionRef.current) {
      const newMutedState = !isMicMuted;
      sessionRef.current.mute(newMutedState);
      setIsMicMuted(newMutedState);
    }
  };

  const toggleSpeakerMute = () => {
    setIsSpeakerMuted(!isSpeakerMuted);
    // Note: Speaker mute would need to be handled at the audio playback level
    // The SDK doesn't have a built-in speaker mute, so this is a UI state for now
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm font-medium">{error}</span>
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
        </div>
      )}

      {/* Messages Area and Voice Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Messages Area */}
        <div
          className={`flex-1 flex flex-col ${isConnected ? "border-r" : ""}`}
        >
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  <p className="text-lg mb-2">No messages yet</p>
                  <p className="text-sm">
                    {isConnected
                      ? "Start speaking or type a message below"
                      : "Connect to start a conversation"}
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isStreaming =
                    streamingMessageRef.current?.itemId === msg.id;
                  return (
                    <div
                      key={idx}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        } ${isStreaming ? "animate-pulse" : ""}`}
                      >
                        <p className="text-sm whitespace-pre-wrap">
                          {isStreaming
                            ? msg.content.split("").map((char, charIdx) => (
                                <span
                                  key={charIdx}
                                  className="inline-block animate-in fade-in"
                                  style={{
                                    animationDuration: "150ms",
                                    animationDelay: `${charIdx * 20}ms`,
                                    animationFillMode: "backwards",
                                  }}
                                >
                                  {char === " " ? "\u00A0" : char}
                                </span>
                              ))
                            : msg.content}
                        </p>
                        <p className="text-xs opacity-70 mt-1">
                          {msg.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              {isSpeaking && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl px-4 py-3">
                    <p className="text-sm text-muted-foreground">Speaking...</p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area - Fixed to chat area bottom */}
          <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="max-w-4xl mx-auto px-6 py-4">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type a message or speak..."
                    disabled={isLoading}
                    className="min-h-[60px] max-h-[200px] resize-none"
                    rows={1}
                  />
                </div>
                <div className="flex gap-2">
                  {!isConnected && (
                    <Button
                      onClick={() => connect(false)}
                      variant="outline"
                      size="icon"
                      className="h-[60px] w-[60px]"
                      disabled={isLoading}
                      title="Connect voice"
                    >
                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Mic className="h-5 w-5 opacity-50" />
                      )}
                    </Button>
                  )}
                  <Button
                    onClick={sendTextMessage}
                    disabled={isLoading || !inputText.trim()}
                    size="icon"
                    className="h-[60px] w-[60px]"
                    title="Send message"
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Voice Session Panel */}
        {isConnected && (
          <div className="w-1/2 flex flex-col bg-muted/30">
            {/* Center Circle */}
            <div className="flex-1 flex items-center justify-center">
              <div
                className={`w-32 h-32 rounded-full border-4 transition-all ${
                  isSpeaking
                    ? "bg-primary/20 border-primary animate-pulse"
                    : "bg-background border-muted-foreground/30"
                }`}
              />
            </div>

            {/* Control Buttons */}
            <div className="p-6 flex gap-3 justify-center border-t">
              <Button
                onClick={toggleMicMute}
                variant={isMicMuted ? "destructive" : "outline"}
                size="lg"
                className="flex-1 max-w-[150px]"
                title={isMicMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {isMicMuted ? (
                  <MicOff className="h-5 w-5 mr-2" />
                ) : (
                  <Mic className="h-5 w-5 mr-2" />
                )}
                {isMicMuted ? "Unmute Mic" : "Mute Mic"}
              </Button>
              <Button
                onClick={toggleSpeakerMute}
                variant={isSpeakerMuted ? "destructive" : "outline"}
                size="lg"
                className="flex-1 max-w-[150px]"
                title={isSpeakerMuted ? "Unmute sound" : "Mute sound"}
              >
                {isSpeakerMuted ? (
                  <VolumeX className="h-5 w-5 mr-2" />
                ) : (
                  <Volume2 className="h-5 w-5 mr-2" />
                )}
                {isSpeakerMuted ? "Unmute Sound" : "Mute Sound"}
              </Button>
              <Button
                onClick={disconnect}
                variant="destructive"
                size="lg"
                className="flex-1 max-w-[150px]"
                title="End session"
              >
                End Session
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
