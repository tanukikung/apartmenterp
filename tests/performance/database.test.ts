import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Database Performance Tests', () => {
  const BENCHMARK_ITERATIONS = 5;
  const MAX_QUERY_TIME = 100; // 100ms for DB queries
  let dbAvailable = false;
  
  beforeAll(async () => {
    // Try to connect quickly; if not available, mark as unavailable and skip tests
    try {
      const connectPromise = prisma.$connect();
      const timeoutPromise = new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 800));
      await Promise.race([connectPromise, timeoutPromise]);
      dbAvailable = true;
    } catch {
      // no-op; tests will early-return
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await prisma.$disconnect();
    }
  });

  describe('Query Performance', () => {
    it('should handle conversation queries efficiently', async () => {
      if (!dbAvailable) return;
      const times: number[] = [];
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const conversations = await prisma.conversation.findMany({
          include: {
            lineUser: true,
            tenant: true,
            room: true,
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 20,
        });
        
        const end = performance.now();
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Conversation queries - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_QUERY_TIME);
      expect(maxTime).toBeLessThan(MAX_QUERY_TIME * 2);
    });

    it('should handle message queries efficiently', async () => {
      if (!dbAvailable) return;
      const times: number[] = [];
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const messages = await prisma.message.findMany({
          orderBy: { sentAt: 'asc' },
          take: 100,
        });
        
        const end = performance.now();
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Message queries - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_QUERY_TIME);
      expect(maxTime).toBeLessThan(MAX_QUERY_TIME * 2);
    });

    it('should handle invoice queries efficiently', async () => {
      if (!dbAvailable) return;
      const times: number[] = [];
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const invoices = await prisma.invoice.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        
        const end = performance.now();
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Invoice queries - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_QUERY_TIME);
      expect(maxTime).toBeLessThan(MAX_QUERY_TIME * 2);
    });

    it('should handle outbox event queries efficiently', async () => {
      if (!dbAvailable) return;
      const times: number[] = [];
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const events = await prisma.outboxEvent.findMany({
          where: { processedAt: null },
          orderBy: { createdAt: 'asc' },
          take: 100,
        });
        
        const end = performance.now();
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Outbox queries - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_QUERY_TIME);
      expect(maxTime).toBeLessThan(MAX_QUERY_TIME * 2);
    });
  });

  describe('Index Performance', () => {
    it('should efficiently query by indexed columns', async () => {
      if (!dbAvailable) return;
      const times: number[] = [];
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        // Test conversation.lastMessageAt index
        const recentConversations = await prisma.conversation.findMany({
          where: {
            lastMessageAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          },
          take: 20,
        });
        
        const end = performance.now();
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      
      console.log(`Indexed column queries - Avg: ${avgTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_QUERY_TIME);
    });
  });
});
