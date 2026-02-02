import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const upgradeHeader = req.headers.get("upgrade");

  if (upgradeHeader !== "websocket") {
    return new Response("Expected Upgrade: websocket", { status: 426 });
  }

  // Get the current project to load context
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return new Response("Project ID is required", { status: 400 });
  }

  // Note: Next.js App Router doesn't support WebSocket upgrades directly
  // This endpoint will serve as documentation for now
  // For production, you should use a separate WebSocket server or a platform that supports WS

  return new Response(
    JSON.stringify({
      message:
        "WebSocket endpoint - use separate server for WebSocket connections",
      instructions:
        "Connect to wss://api.openai.com/v1/realtime?model=gpt-realtime directly from client with ephemeral token",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
