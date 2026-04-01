/**
 * Lightweight check for LINE configuration — safe to import in Client Components.
 * Does NOT import the full LINE client (which pulls in server-only modules like 'fs').
 *
 * TOKEN FALLBACK LOGIC:
 *   LINE_ACCESS_TOKEN="" (or unset)  →  falls through to LINE_CHANNEL_ACCESS_TOKEN
 *   LINE_CHANNEL_ACCESS_TOKEN=""     →  LINE unavailable
 *   Both empty/unset                →  LINE unavailable
 *
 * Setting LINE_ACCESS_TOKEN="" does NOT mean "disabled". It means "use the
 * fallback token". To make LINE unavailable, leave BOTH tokens empty or unset.
 */
export function isLineConfigured(): boolean {
  return !!(
    process.env.LINE_CHANNEL_ID &&
    process.env.LINE_CHANNEL_SECRET &&
    (process.env.LINE_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN)
  );
}
