import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { withTiming } from '@/lib/performance/timingMiddleware';
import { toConversationMessageDto } from '@/modules/messaging/message-dto';

export const dynamic = 'force-dynamic';

const getConversation = asyncHandler(
  async (
    _req: NextRequest,
    { params }: { params: { id: string } },
  ): Promise<NextResponse> => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        tenant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        messages: {
          orderBy: { sentAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation', params.id);
    }

    const data = {
      id: conversation.id,
      lineUserId: conversation.lineUserId,
      status: conversation.status,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      tenant: conversation.tenant
        ? {
            id: conversation.tenant.id,
            fullName: `${conversation.tenant.firstName} ${conversation.tenant.lastName}`.trim(),
            phone: conversation.tenant.phone,
          }
        : null,
      messages: conversation.messages.map(toConversationMessageDto),
    };

    return NextResponse.json({
      success: true,
      data,
    } as ApiResponse<typeof data>);
  },
);

export const GET = withTiming(getConversation);
