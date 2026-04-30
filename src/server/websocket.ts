/**
 * WebSocket Server for LINE Chat
 *
 * Uses Socket.io with Redis adapter for cross-instance pub/sub.
 * Runs as part of the custom Next.js server (server.ts).
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { getRedisUrl } from '@/infrastructure/redis';
import { logger } from '@/lib/utils/logger';
import {
  recordConnection,
  recordDisconnection,
  recordMessageDelivered,
  startAuditPersistence,
} from '@/server/ws-audit';
import { verifySessionToken } from '@/lib/auth/session';
import { resolveAuthSecret } from '@/lib/config/env';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessagePayload {
  type: 'new_message';
  conversationId: string;
  messageId: string;
  senderId: string;
  timestamp: string;
  // Extended fields for richer client updates
  content?: string;
  direction?: 'INCOMING' | 'OUTGOING';
  messageType?: string;
  roomNo?: string | null;
  // Timestamp when the webhook was received (for latency calculation)
  webhookReceivedAt?: number;
}

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  sessionId?: string;
  conversationId?: string;
}

// ─── Module-level state ───────────────────────────────────────────────────────

let io: SocketIOServer | null = null;
let pubClient: ReturnType<typeof createClient> | null = null;
let subClient: ReturnType<typeof createClient> | null = null;

/**
 * Conversation room name for a given conversationId.
 */
export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

// ─── Auth middleware ───────────────────────────────────────────────────────────

function authMiddleware(socket: AuthenticatedSocket, next: (err?: Error) => void): void {
  const cookieHeader = socket.handshake.headers.cookie ?? '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((pair) => {
      const idx = pair.indexOf('=');
      if (idx < 0) return [pair.trim(), ''];
      return [pair.slice(0, idx).trim(), pair.slice(idx + 1).trim()];
    })
  );

  const token = socket.handshake.auth.token ||
    socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') ||
    cookies['auth_session'];

  if (token) {
    try {
      const session = verifySessionToken(token, resolveAuthSecret());
      if (session) {
        socket.userId = session.sub;
        socket.sessionId = session.sub;
      } else {
        // Invalid/expired token — reject the connection
        return next(new Error('Invalid or expired session token'));
      }
    } catch {
      return next(new Error('Authentication failed'));
    }
  } else {
    return next(new Error('Authentication required'));
  }
  next();
}

// ─── Connection handlers ─────────────────────────────────────────────────────

function registerConnectionHandlers(socket: AuthenticatedSocket): void {
  const userId = socket.userId || 'unknown';
  const sessionId = socket.sessionId || socket.id;

  // Handle 'join' — client emits this to subscribe to a conversation room
  socket.on('join', ({ conversationId }: { conversationId: string }) => {
    const room = conversationRoom(conversationId);
    socket.join(room);
    // Track conversationId on socket for disconnect audit
    (socket as AuthenticatedSocket & { conversationId?: string }).conversationId = conversationId;
    logger.debug({ socketId: socket.id, room }, 'WS client joined room');
  });

  // Handle 'typing' — broadcast typing indicator to other clients in the room
  socket.on('typing', ({ conversationId }: { conversationId: string }) => {
    const room = conversationRoom(conversationId);
    socket.to(room).emit('typing', { conversationId, userId });
  });

  socket.on('disconnect', (reason) => {
    const convId = (socket as AuthenticatedSocket & { conversationId?: string }).conversationId || sessionId;
    logger.info({ socketId: socket.id, reason }, 'WS client disconnected');
    recordDisconnection(convId, userId);
  });

  socket.on('error', (error) => {
    logger.error({ socketId: socket.id, error: error.message }, 'WS socket error');
  });

  logger.info({ socketId: socket.id }, 'WS client connected');
  recordConnection(sessionId, userId);
}

// ─── initWebSocket ─────────────────────────────────────────────────────────────

/**
 * Initialize Socket.io and attach it to the given HTTP server.
 * Safe to call multiple times — returns the existing instance if already initialized.
 */
export function initWebSocket(httpServer: HttpServer): SocketIOServer {
  if (io) {
    logger.info('WebSocket server already initialized — returning existing instance');
    return io;
  }

  const redisUrl = getRedisUrl();

  io = new SocketIOServer(httpServer, {
    path: '/api/socket.io',
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? process.env.WS_CORS_ORIGIN ?? false  // strict: explicitly set or deny
        : '*',                                 // dev: allow all
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    // Allow 1MB max payload (LINE messages can be large with flex messages)
    maxHttpBufferSize: 1e6,
  });

  // Use Redis adapter for cross-instance pub/sub
  // Two separate clients are required: one for publishing, one for subscribing.
  const createRedisClients = async (): Promise<void> => {
    try {
      pubClient = createClient({ url: redisUrl });
      subClient = createClient({ url: redisUrl });

      pubClient.on('error', (err) => logger.error({ error: err.message }, 'WS Redis pub client error'));
      subClient.on('error', (err) => logger.error({ error: err.message }, 'WS Redis sub client error'));

      await Promise.all([pubClient.connect(), subClient.connect()]);

      io!.adapter(createAdapter(pubClient, subClient));
      logger.info({ redisUrl }, 'WS Redis adapter connected');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ error: message }, 'WS Redis adapter failed — falling back to in-memory (no cross-instance pub/sub)');
      // io.adapter remains the default in-memory adapter
    }
  };

  // Apply auth middleware
  io.use(authMiddleware);

  // Register connection lifecycle
  io.on('connection', registerConnectionHandlers);

  // Initialize Redis adapter asynchronously (non-blocking)
  void createRedisClients();

  // Start audit persistence timer
  startAuditPersistence();

  logger.info('WebSocket server initialized');
  return io;
}

/**
 * Get the active Socket.io server instance.
 * Throws if initWebSocket has not been called.
 */
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io not initialized — call initWebSocket first');
  }
  return io;
}

/**
 * Gracefully shut down the WebSocket server.
 */
export async function closeWebSocket(): Promise<void> {
  if (!io) return;

  await new Promise<void>((resolve) => {
    io!.close(() => {
      logger.info('WebSocket server closed');
      resolve();
    });
  });

  io = null;

  if (pubClient) {
    await pubClient.quit().catch((err) => {
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'WS Redis pub client quit failed');
    });
    pubClient = null;
  }
  if (subClient) {
    await subClient.quit().catch((err) => {
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'WS Redis sub client quit failed');
    });
    subClient = null;
  }
}

/**
 * Publish a chat message event to a conversation room across all instances.
 * Called by the LINE webhook handler after saving a message to the DB.
 */
export function publishChatMessage(payload: ChatMessagePayload): void {
  if (!io) {
    logger.warn('publishChatMessage called but io is not initialized');
    return;
  }

  const room = conversationRoom(payload.conversationId);

  // Emit to all clients in the room (local + remote via Redis adapter)
  io.to(room).emit('chat:message', payload);

  // Record delivery metrics
  const latencyMs = payload.webhookReceivedAt
    ? Date.now() - payload.webhookReceivedAt
    : -1;
  recordMessageDelivered(payload.conversationId, latencyMs);

  logger.debug({
    room,
    conversationId: payload.conversationId,
    messageId: payload.messageId,
    type: payload.type,
  }, 'Published chat:message to room');
}
