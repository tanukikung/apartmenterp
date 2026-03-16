import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { performance } from 'perf_hooks';
import { prisma } from '@/lib';
import { createTestConversation, createTestMessage, createTestRoom, createTestTenant } from '../helpers/testData';

const ENABLE_HTTP = process.env.RUN_HTTP_BENCHMARKS === '1';
const ENABLE_DB = process.env.RUN_DB_BENCHMARKS === '1';
const ENABLE_WORKER = process.env.RUN_WORKER_BENCHMARKS === '1';

describe('Performance Benchmarks', () => {
  const BENCHMARK_ITERATIONS = 10;
  const MAX_ACCEPTABLE_TIME = 500; // 500ms
  
  beforeAll(async () => {
    // Mock external services
    vi.doMock('@/lib/line', () => ({
      sendLineMessage: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    }));
    
    vi.doMock('@/lib/storage', () => ({
      uploadFile: vi.fn().mockResolvedValue({ key: 'test-file-key', url: 'https://test.com/file' }),
      getFileUrl: vi.fn().mockResolvedValue('https://test.com/file'),
    }));
    
    // Setup test data only when running HTTP benchmarks against a live server
    if (ENABLE_HTTP) {
      await createTestTenant();
      await createTestRoom();
      await createTestConversation();
    }
  });

  afterAll(async () => {
    // Cleanup
    await prisma.message.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.room.deleteMany();
    await prisma.tenant.deleteMany();
  });

  describe('API Endpoints', () => {
    it('GET /api/conversations - should respond within acceptable time', async () => {
      if (!ENABLE_HTTP) return;
      const times: number[] = [];
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const response = await fetch('http://localhost:3000/api/conversations?page=1&pageSize=20');
        
        const end = performance.now();
        times.push(end - start);
        
        expect(response.status).toBe(200);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`GET /api/conversations - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_ACCEPTABLE_TIME);
      expect(maxTime).toBeLessThan(MAX_ACCEPTABLE_TIME * 2);
    });

    it('GET /api/conversations/[id]/messages - should respond within acceptable time', async () => {
      if (!ENABLE_HTTP) return;
      const conversation = await createTestConversation();
      await createTestMessage(conversation.id);
      
      const times: number[] = [];
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const response = await fetch(`http://localhost:3000/api/conversations/${conversation.id}/messages`);
        
        const end = performance.now();
        times.push(end - start);
        
        expect(response.status).toBe(200);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`GET /api/conversations/[id]/messages - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_ACCEPTABLE_TIME);
      expect(maxTime).toBeLessThan(MAX_ACCEPTABLE_TIME * 2);
    });

    it('GET /api/metrics - should respond within acceptable time', async () => {
      if (!ENABLE_HTTP) return;
      const times: number[] = [];
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const response = await fetch('http://localhost:3000/api/metrics');
        
        const end = performance.now();
        times.push(end - start);
        
        expect(response.status).toBe(200);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`GET /api/metrics - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_ACCEPTABLE_TIME);
      expect(maxTime).toBeLessThan(MAX_ACCEPTABLE_TIME * 2);
    });

    it('GET /api/health/deep - should respond within acceptable time', async () => {
      if (!ENABLE_HTTP) return;
      const times: number[] = [];
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const response = await fetch('http://localhost:3000/api/health/deep');
        
        const end = performance.now();
        times.push(end - start);
        
        expect(response.status).toBe(200);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`GET /api/health/deep - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_ACCEPTABLE_TIME);
      expect(maxTime).toBeLessThan(MAX_ACCEPTABLE_TIME * 2);
    });
  });

  describe('Database Query Performance', () => {
    it('should handle conversation queries efficiently', async () => {
      if (!ENABLE_DB) return;
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
        
        expect(conversations).toBeDefined();
        expect(conversations.length).toBeLessThanOrEqual(20);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Conversation queries - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(100); // DB queries should be fast
      expect(maxTime).toBeLessThan(200);
    });

    it('should handle message queries efficiently', async () => {
      if (!ENABLE_DB) return;
      const conversation = await createTestConversation();
      
      // Create multiple messages
      for (let i = 0; i < 50; i++) {
        await createTestMessage(conversation.id);
      }
      
      const times: number[] = [];
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const messages = await prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { sentAt: 'asc' },
          take: 100,
        });
        
        const end = performance.now();
        times.push(end - start);
        
        expect(messages).toBeDefined();
        expect(messages.length).toBeLessThanOrEqual(100);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Message queries - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(100);
      expect(maxTime).toBeLessThan(200);
    });
  });

  describe('Outbox Worker Performance', () => {
    it('should process events efficiently', async () => {
      if (!ENABLE_WORKER) return;
      const { OutboxProcessor } = await import('@/lib/outbox/processor');
      const processor = new OutboxProcessor();
      
      const times: number[] = [];
      
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        
        const result = await processor.process();
        
        const end = performance.now();
        times.push(end - start);
        
        expect(result).toBeDefined();
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Outbox processing - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(1000); // Outbox processing can be slower
      expect(maxTime).toBeLessThan(2000);
    });
  });
});
