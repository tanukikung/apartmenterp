/**
 * SSE broadcaster — in-memory client registry for real-time notifications.
 * Works for single-instance deployment (no Redis needed).
 */

const clients = new Set<ReadableStreamDefaultController>();

export function addSseClient(controller: ReadableStreamDefaultController): void {
  clients.add(controller);
}

export function removeSseClient(controller: ReadableStreamDefaultController): void {
  clients.delete(controller);
}

export function clearAllSseClients(): void {
  clients.forEach((c) => clients.delete(c));
}

export function broadcastLineMessage(msg: {
  id: string;
  type: string;
  roomNo: string | null;
  content: string;
  createdAt: string;
  tenantId: string | null;
  lineMessageId: string | null;
  webhookReceivedAt?: number;
}): void {
  if (clients.size === 0) return;

  const notification = {
    ...msg,
    status: 'NEW',
    adminId: null,
    contractId: null,
    scheduledAt: null,
    sentAt: null,
    errorMessage: null,
  };

  const data = JSON.stringify(notification);
  const encoded = new TextEncoder().encode(`event: notification\ndata: ${data}\n\n`);

  for (const client of clients) {
    try {
      client.enqueue(encoded);
    } catch {
      clients.delete(client);
    }
  }
}
