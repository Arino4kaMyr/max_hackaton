import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../config/env.js';

let prisma = null;

export function getPrisma() {
  if (!prisma) {
    const env = loadEnv();
    const nodeEnv = env.nodeEnv;
    
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: env.databaseUrl,
        },
      },
      log: nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return prisma;
}

