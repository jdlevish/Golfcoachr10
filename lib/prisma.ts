import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaUrl: string | undefined;
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const createClient = () =>
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });

const shouldReuse =
  globalForPrisma.prisma &&
  globalForPrisma.prismaUrl &&
  globalForPrisma.prismaUrl === databaseUrl;

const prismaClient: PrismaClient = shouldReuse
  ? (globalForPrisma.prisma as PrismaClient)
  : createClient();

export const prisma = prismaClient;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaClient;
  globalForPrisma.prismaUrl = databaseUrl;
}
