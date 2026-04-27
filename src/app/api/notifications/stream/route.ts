import { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { addSseClient, removeSseClient, clearAllSseClients } from '@/lib/sse/broadcaster';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    requireRole(req, ['ADMIN', 'STAFF']);
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      addSseClient(controller);

      // Send initial connection confirmation
      try {
        controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));
      } catch {
        removeSseClient(controller);
        return;
      }

      // Clean up on client disconnect
      req.signal.addEventListener('abort', () => {
        removeSseClient(controller);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      clearAllSseClients();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// broadcastNotification is available from '@/lib/sse/broadcaster' for callers that need it
