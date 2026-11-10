import { PrismaClient } from '../generated/prisma/index.js';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more:
// https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({} as any)

Object.defineProperties(prisma, {
  TH_CLIMA: { get() { return (this as any).th_clima; } },
  TH_SUELO: { get() { return (this as any).th_suelo; } },
  tT_LECTU: { get() { return (this as any).tt_lectu; } },
  TT_LECTU: { get() { return (this as any).tt_lectu; } },
  tT_LOGCO: { get() { return (this as any).tt_logco; } },
  TT_LOGCO: { get() { return (this as any).tt_logco; } },
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
