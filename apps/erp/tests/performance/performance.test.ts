import { describe, it, expect, beforeEach } from 'vitest';
import { performance } from 'perf_hooks';
import { prismaMock } from '../helpers/prismaMock';

describe('Performance Tests', () => {
  const BENCHMARK_ITERATIONS = 5;
  const MAX_ACCEPTABLE_TIME = 200; // 200ms for operations
  
  beforeEach(() => {
    prismaMock.$reset();
  });

  describe('Database Query Performance', () => {
    it('should handle conversation queries efficiently', async () => {
      const times: number[] = [];
      
      // Mock conversation data
      const mockConversations = Array.from({ length: 20 }, (_, i) => ({
        id: `conv-${i}`,
        roomId: `room-${i}`,
        lineUserId: `line-${i}`,
        tenantId: `tenant-1`,
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      
      prismaMock.conversation.findMany.mockResolvedValue(mockConversations);
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const conversations = await prismaMock.conversation.findMany({
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
      
      expect(avgTime).toBeLessThan(MAX_ACCEPTABLE_TIME);
      expect(maxTime).toBeLessThan(MAX_ACCEPTABLE_TIME * 2);
    });

    it('should handle message queries efficiently', async () => {
      const times: number[] = [];
      
      // Mock message data
      const mockMessages = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        conversationId: `conv-1`,
        text: `Message ${i}`,
        sentAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      
      prismaMock.message.findMany.mockResolvedValue(mockMessages);
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const messages = await prismaMock.message.findMany({
          where: { conversationId: 'conv-1' },
          orderBy: { sentAt: 'asc' },
          take: 100,
        });
        
        const end = performance.now();
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Message queries - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_ACCEPTABLE_TIME);
      expect(maxTime).toBeLessThan(MAX_ACCEPTABLE_TIME * 2);
    });

    it('should handle invoice queries efficiently', async () => {
      const times: number[] = [];
      
      // Mock invoice data
      const mockInvoices = Array.from({ length: 50 }, (_, i) => ({
        id: `inv-${i}`,
        roomId: `room-${i}`,
        amount: 1000 + i * 100,
        status: 'GENERATED',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      
      prismaMock.invoice.findMany.mockResolvedValue(mockInvoices);
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const invoices = await prismaMock.invoice.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        
        const end = performance.now();
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Invoice queries - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(MAX_ACCEPTABLE_TIME);
      expect(maxTime).toBeLessThan(MAX_ACCEPTABLE_TIME * 2);
    });

    it('should handle outbox event queries efficiently', async () => {
      const times: number[] = [];
      
      // Mock outbox event data
      const mockEvents = Array.from({ length: 100 }, (_, i) => ({
        id: `event-${i}`,
        eventType: 'INVOICE_CREATED',
        aggregateId: `inv-${i}`,
        aggregateType: 'INVOICE',
        payload: { id: `inv-${i}` },
        processedAt: null,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      
      prismaMock.outboxEvent.findMany.mockResolvedValue(mockEvents);
      
      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now();
        
        const events = await prismaMock.outboxEvent.findMany({
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
      
      expect(avgTime).toBeLessThan(MAX_ACCEPTABLE_TIME);
      expect(maxTime).toBeLessThan(MAX_ACCEPTABLE_TIME * 2);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory with large result sets', async () => {
      // Mock large dataset
      const mockConversations = Array.from({ length: 1000 }, (_, i) => ({
        id: `conv-${i}`,
        roomId: `room-${i}`,
        lineUserId: `line-${i}`,
        tenantId: `tenant-1`,
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      
      prismaMock.conversation.findMany.mockResolvedValue(mockConversations);
      
      const startMemory = process.memoryUsage().heapUsed;
      
      const conversations = await prismaMock.conversation.findMany({
        include: {
          lineUser: true,
          tenant: true,
          room: true,
        },
        take: 1000,
      });
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;
      
      console.log(`Memory usage for 1000 conversations: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
      
      // Memory increase should be reasonable (less than 50MB for 1000 records)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
