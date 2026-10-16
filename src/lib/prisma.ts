import { PrismaClient } from "@prisma/client";

/**
 * Single shared Prisma client. Cached on globalThis so the dev server does not
 * create a new connection pool on every hot reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
