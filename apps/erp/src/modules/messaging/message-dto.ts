type ConversationMessageLike = {
  id: string;
  lineMessageId?: string;
  direction: 'INCOMING' | 'OUTGOING';
  type: string;
  content: string;
  metadata?: unknown;
  isRead?: boolean;
  readAt?: Date | null;
  sentAt: Date;
};

export type ConversationMessageDto = {
  id: string;
  lineMessageId: string | null;
  direction: 'INCOMING' | 'OUTGOING';
  type: string;
  content: string;
  metadata: Record<string, unknown> | null;
  sentAt: string;
  isRead: boolean;
  readAt: string | null;
  sender: 'Tenant' | 'Admin';
  status: string | null;
};

export function toConversationMessageDto(
  message: ConversationMessageLike,
): ConversationMessageDto {
  const metadata =
    typeof message.metadata === 'object' && message.metadata !== null
      ? (message.metadata as Record<string, unknown>)
      : null;
  const status =
    metadata && typeof metadata.status === 'string'
      ? metadata.status
      : null;

  return {
    id: message.id,
    lineMessageId: message.lineMessageId || null,
    direction: message.direction,
    type: message.type,
    content: message.content,
    metadata,
    sentAt: message.sentAt.toISOString(),
    isRead: Boolean(message.isRead),
    readAt: message.readAt ? message.readAt.toISOString() : null,
    sender: message.direction === 'INCOMING' ? 'Tenant' : 'Admin',
    status,
  };
}
