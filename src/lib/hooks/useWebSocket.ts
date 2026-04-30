/**
 * useWebSocket — real-time chat connection.
 * Stub implementation until Socket.io server is wired up.
 * Chat page falls back to polling when this returns no-op.
 */

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type UseWebSocketOptions = {
  onMessage?: (msg: unknown) => void;
  onStatusChange?: (status: WebSocketStatus) => void;
};

export function useWebSocket(
  _conversationId: string | null,
  _options?: UseWebSocketOptions
): { sendTypingIndicator: () => void } {
  return { sendTypingIndicator: () => {} };
}
