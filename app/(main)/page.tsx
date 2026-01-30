import prisma from "@/prisma/prisma";
import Client from "./client";
import { projectSerializer } from "@/utils/schemas/project";

export default async function Page() {
  const defaultProject = await prisma.project.findFirst({
    where: { current: true },
    include: { prompt: true, contexts: true },
  });

  if (!defaultProject) return <div>No current project found.</div>;

  return <Client defaultProject={projectSerializer(defaultProject)} />;
}
