import prisma from "@/prisma/prisma";
import Client from "../../client";
import { projectSerializer } from "@/utils/schemas/project";
import { chatSerializer } from "@/utils/schemas/chat";
import { notFound } from "next/navigation";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [defaultProject, existingChat] = await Promise.all([
    prisma.project.findFirst({
      where: { current: true },
      include: { prompt: true, contexts: true },
    }),
    prisma.chat.findUnique({
      where: { id },
      include: { messages: true },
    }),
  ]);

  if (!defaultProject) return <div>No current project found.</div>;
  if (!existingChat) return notFound();

  return (
    <Client
      defaultProject={projectSerializer(defaultProject)}
      existingChat={chatSerializer(existingChat)}
    />
  );
}
