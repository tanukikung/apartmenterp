import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getAuditSnapshot } from '@/server/ws-audit';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER']);

  const snapshot = getAuditSnapshot();

  const avgLatency =
    snapshot.avgLatencyMs !== null ? `${snapshot.avgLatencyMs}ms` : null;

  return NextResponse.json({
    success: true,
    data: {
      connections: snapshot.connections,
      messagesDelivered: snapshot.messagesDelivered,
      messagesFailed: snapshot.messagesFailed,
      reconnections: snapshot.reconnections,
      avgLatency: avgLatency,
      minLatencyMs: snapshot.minLatencyMs,
      maxLatencyMs: snapshot.maxLatencyMs,
      uptime: snapshot.uptime,
      connectionHistory: snapshot.connectionHistory.map((e) => ({
        ...e,
        timestamp: new Intl.DateTimeFormat('th-TH', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date(e.timestamp)),
      })),
    },
  } as ApiResponse<{
    connections: number;
    messagesDelivered: number;
    messagesFailed: number;
    reconnections: number;
    avgLatency: string | null;
    minLatencyMs: number | null;
    maxLatencyMs: number | null;
    uptime: string;
    connectionHistory: Array<{
      timestamp: string;
      event: 'connect' | 'disconnect';
      conversationId: string;
      userId: string;
    }>;
  }>);
});
