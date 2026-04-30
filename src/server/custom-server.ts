/**
 * Custom Next.js server with WebSocket (Socket.io) support.
 *
 * Usage:
 *   npx tsx server.ts
 *   OR: node server.js   (after tsx transpile or build)
 *
 * This server:
 *   1. Creates an HTTP server wrapping the Next.js request handler
 *   2. Attaches Socket.io WebSocket server on the same HTTP server
 *   3. Initializes the instrumentation hook by importing the Next.js app
 *
 * Socket.io runs on the same port as Next.js at the path /api/socket.io.
 * Redis adapter is used for cross-instance pub/sub.
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initWebSocket, closeWebSocket } from '@/server/websocket';

const PORT = parseInt(process.env.PORT || '3001', 10);
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev, customServer: false });
const handle = app.getRequestHandler();

// Track active connections for graceful shutdown
let httpServer: ReturnType<typeof createServer> | null = null;

async function start(): Promise<void> {
  try {
    await app.prepare();
  } catch (err) {
    console.error('Next.js app preparation failed:', err);
    process.exit(1);
  }

  httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true);
    await handle(req, res, parsedUrl);
  });

  // Initialize WebSocket server on the same HTTP server
  initWebSocket(httpServer);

  httpServer.on('error', (err) => {
    console.error('HTTP server error:', err);
  });

  httpServer.listen(PORT, () => {
    console.log(`> Apartment ERP ready on http://localhost:${PORT}`);
    console.log(`> WebSocket server ready on ws://localhost:${PORT}/api/socket.io`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received — shutting down gracefully`);
    if (httpServer) {
      await closeWebSocket();
      await new Promise<void>((resolve) => {
        httpServer!.close(() => {
          console.log('HTTP server closed');
          resolve();
        });
      });
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Server start failed:', err);
  process.exit(1);
});
