/**
 * Lightweight check for LINE configuration — safe to import in Client Components.
 * Does NOT import the full LINE client (which pulls in server-only modules like 'fs').
 */
export function isLineConfigured(): boolean {
  return !!(
    process.env.LINE_CHANNEL_ID &&
    process.env.LINE_CHANNEL_SECRET &&
    (process.env.LINE_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN)
  );
}
