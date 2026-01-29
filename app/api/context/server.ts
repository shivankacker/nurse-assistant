import prisma from "@/prisma/prisma";
import { contextSerializer } from "@/utils/schemas/context";

export async function getServerContext() {
  const context = await prisma.context.findMany({});
  return context.map(contextSerializer);
}
