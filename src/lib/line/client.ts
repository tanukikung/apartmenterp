import { Client, ClientConfig, WebhookEvent, MessageAPIResponseBase } from '@line/bot-sdk';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface LineConfig {
  channelId: string;
  channelSecret: string;
  accessToken: string;
  userId?: string;
}

export interface LineMessageOptions {
  retryCount?: number;
  retryDelay?: number;
}

export interface LineUserProfile {
  displayName: string;
  pictureUrl: string | null;
  statusMessage: string | null;
  userId: string;
}

// ============================================================================
// Constants
// ============================================================================

const LINE_TOKEN_REFRESH_MAX_RETRIES = 3;
const LINE_TOKEN_REFRESH_BASE_DELAY_MS = 1000;

// ============================================================================
// LINE Client Wrapper
// ============================================================================

class LineClientWrapper {
  private client: Client | null = null;
  private config: LineConfig | null = null;
  private tokenExpiresAt: number = 0;
  /** Set to true when refresh fails after all retries so the next request forces a fresh attempt. */
  private refreshFailed = false;

  /**
   * Ensure the access token is still valid — refresh if expired or about to expire.
   * LINE channel access tokens are valid for 30 days (2592000 seconds). We refresh
   * proactively when < 5 days remain, to avoid edge-case failures near expiry.
   * Called lazily on each outbound operation via withRetry wrapper.
   *
   * On refresh failure: retries up to 3 times with exponential backoff (1s, 2s, 4s).
   * After retries exhausted, sets an internal flag so the next request tries again
   * rather than reusing a stale token. Does not throw — degraded functionality is
   * preferred over total failure.
   */
  async ensureTokenFresh(): Promise<void> {
    const now = Date.now();
    // Refresh if token expires within 5 days (avoids expiry during long-running operations)
    // Also refresh if a previous refresh attempt failed (refreshFailed flag)
    if (
      this.tokenExpiresAt === 0 ||
      now >= this.tokenExpiresAt - 5 * 24 * 60 * 60 * 1000 ||
      this.refreshFailed
    ) {
      await this.refreshAccessTokenWithRetry();
    }
  }

  /**
   * Refresh the LINE access token with retry and exponential backoff.
   * Retries up to LINE_TOKEN_REFRESH_MAX_RETRIES times on failure.
   * After all retries are exhausted, sets refreshFailed so the next request
   * will try again (rather than silently using a stale token).
   */
  private async refreshAccessTokenWithRetry(): Promise<void> {
    for (
      let attempt = 1;
      attempt <= LINE_TOKEN_REFRESH_MAX_RETRIES;
      attempt++
    ) {
      try {
        await this.doRefreshAccessToken();
        // Success — reset failure flag and retry counter
        this.refreshFailed = false;
        return;
      } catch (err) {
        const delay = LINE_TOKEN_REFRESH_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn({
          type: 'line_token_refresh_retry',
          attempt,
          maxRetries: LINE_TOKEN_REFRESH_MAX_RETRIES,
          delayMs: delay,
          error: err instanceof Error ? err.message : String(err),
        });

        if (attempt < LINE_TOKEN_REFRESH_MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted — mark refresh as failed so next request tries again
    this.refreshFailed = true;
    logger.error({
      type: 'line_token_refresh_exhausted',
      message: 'LINE token refresh failed after 3 retries; will retry on next request',
    });
  }

  /**
   * Perform a single token refresh attempt against the LINE API.
   * Throws on network failure or non-2xx response so the caller can retry.
   */
  private async doRefreshAccessToken(): Promise<void> {
    const channelId = process.env.LINE_CHANNEL_ID;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    if (!channelId || !channelSecret) {
      throw new Error('LINE credentials not configured');
    }

    const url = 'https://api.line.me/oauth2/v2.1/token';
    const grantType = 'client_credentials';

    let newToken: string | null = null;
    let newExpiresIn = 0;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: grantType,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    if (!res.ok) {
      throw new Error(`LINE token refresh failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as { access_token?: string; expires_in?: number };
    newToken = data.access_token ?? null;
    newExpiresIn = data.expires_in ?? 0;

    if (!newToken || newExpiresIn <= 0) {
      throw new Error('LINE token refresh returned empty token or invalid expires_in');
    }

    this.config = {
      ...this.config!,
      accessToken: newToken,
    };
    this.tokenExpiresAt = Date.now() + newExpiresIn * 1000;
    this.client = new Client({ channelAccessToken: newToken, channelSecret: this.config.channelSecret });
    logger.info({ type: 'line_token_refreshed', expiresInSeconds: newExpiresIn });
  }

  /**
   * Initialize or get the LINE client
   */
  getClient(): Client {
    if (!this.client) {
      const config = this.getConfig();
      const clientConfig: ClientConfig = {
        channelAccessToken: config.accessToken,
        channelSecret: config.channelSecret,
      };
      this.client = new Client(clientConfig);
    }
    return this.client;
  }

  /**
   * Reset cached config and client — intended for testing only.
   */
  reset(): void {
    this.client = null;
    this.config = null;
    this.tokenExpiresAt = 0;
    this.refreshFailed = false;
  }

  /**
   * Get LINE configuration from environment
   */
  getConfig(): LineConfig {
    if (this.config) {
      return this.config;
    }

    const channelId = process.env.LINE_CHANNEL_ID;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    // TOKEN FALLBACK: LINE_ACCESS_TOKEN || LINE_CHANNEL_ACCESS_TOKEN
    //
    // - LINE_ACCESS_TOKEN (primary): set this to the long-lived access token from
    //   the LINE Developer Console. This is the preferred variable for new setups.
    //
    // - LINE_CHANNEL_ACCESS_TOKEN (legacy fallback): older deployments may have
    //   configured this instead. If LINE_ACCESS_TOKEN is set to a non-empty value,
    //   that token is used. If it is empty (""), the SDK falls through to
    //   LINE_CHANNEL_ACCESS_TOKEN — if that is non-empty, it is used.
    //
    // - Both empty/unset → LINE is unavailable (getConfig throws).
    //
    // NOTE: Setting LINE_ACCESS_TOKEN="" does NOT mean "disabled". It means
    // "use the fallback token instead". To disable LINE, leave both empty.
    const accessToken = process.env.LINE_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    const userId = process.env.LINE_USER_ID;

    if (!channelId || !channelSecret || !accessToken) {
      throw new Error('LINE credentials not configured');
    }

    this.config = {
      channelId,
      channelSecret,
      accessToken,
      userId,
    };

    return this.config;
  }

  /**
   * Reinitialize client with new config
   */
  reinitialize(config: LineConfig): void {
    this.config = config;
    this.client = new Client({
      channelAccessToken: config.accessToken,
      channelSecret: config.channelSecret,
    });
  }

  /**
   * Upload image/content to LINE CDN — returns messageId
   * Use returned messageId as: https://api-data.line.me/v2/bot/message/{messageId}/content
   */
  async uploadContent(buffer: Buffer, mimeType: string): Promise<string> {
    const config = this.getConfig();
    const url = 'https://api-data.line.me/v2/bot/message/content';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': mimeType,
        'Content-Length': String(buffer.length),
      },
      body: new Uint8Array(buffer),
    });
    if (!response.ok) {
      throw new Error(`LINE content upload failed: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as { messageId: string };
    return data.messageId;
  }
}

// Singleton instance
const lineClientWrapper = new LineClientWrapper();

// Failed message channel constant
const LINE_CHANNEL = 'LINE';

// ============================================================================
// FailedMessage DLQ
// ============================================================================

/**
 * Record a message send failure to the FailedMessage table after all retries
 * are exhausted. The record is stored with channel='LINE' so the admin UI can
 * list, review, and manually retry failed LINE messages.
 */
async function recordFailedMessage(payload: Record<string, unknown>, failureReason: string): Promise<void> {
  // Import prisma lazily to avoid circular dependency issues at module load time.
  const { prisma: db } = await import('@/lib/db/client');
  try {
    await db.failedMessage.create({
      data: {
        channel: LINE_CHANNEL,
        payload: payload as never,
        failureReason,
        attemptCount: 0,
        lastAttemptAt: new Date(),
      },
    });
  } catch (err) {
    // If recording itself fails, log and continue — we don't want DLQ failure
    // to crash the caller. The message is already lost, but at least we log.
    logger.error({
      type: 'failed_message_record_error',
      error: err instanceof Error ? err.message : String(err),
      payload,
    });
  }
}

// ============================================================================
// Retry Logic
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  options: LineMessageOptions = {},
  capturePayload?: () => Record<string, unknown>
): Promise<T> {
  const maxRetries = options.retryCount ?? 3;
  const baseDelay = options.retryDelay ?? 1000;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Ensure token is fresh before each attempt (handles proactive refresh)
      await lineClientWrapper.ensureTokenFresh();

      const timeoutMs = 10000;
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LINE request timeout')), timeoutMs)
        ),
      ]);
      return result as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      // Don't retry on certain errors
      if (lastError.message.includes('Invalid token') ||
          lastError.message.includes('Signature validation failed') ||
          lastError.message.includes('Quota exceeded')) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);

      logger.warn({
        type: 'line_retry',
        attempt,
        maxRetries,
        delay,
        error: lastError.message,
      });

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted — record to FailedMessage DLQ if payload capture is available
  if (capturePayload) {
    await recordFailedMessage(
      capturePayload(),
      lastError?.message ?? 'Unknown error after retries'
    );
  }

  throw lastError;
}

// ============================================================================
// Public Functions
// ============================================================================

/**
 * Get initialized LINE client
 */
export function getLineClient(): Client {
  return lineClientWrapper.getClient();
}

/**
 * Get LINE configuration
 */
export function getLineConfig(): LineConfig {
  return lineClientWrapper.getConfig();
}

/**
 * Reset the cached LINE client and config — for unit testing only.
 */
export function resetLineClient(): void {
  lineClientWrapper.reset();
}

/**
 * Upload binary content to LINE CDN.
 * Returns a messageId — form the content URL as:
 * https://api-data.line.me/v2/bot/message/{messageId}/content
 */
export async function uploadContentToLine(buffer: Buffer, mimeType: string): Promise<string> {
  return lineClientWrapper.uploadContent(buffer, mimeType);
}

/**
 * Send a flex message
 */
export async function sendFlexMessage(
  userId: string,
  altText: string,
  contents: object,
  options: LineMessageOptions = {},
  quickReplyItems?: QuickReplyItem[]
): Promise<MessageAPIResponseBase> {
  const payload = { userId, altText, contents, options, quickReplyItems };
  return withRetry(
    async () => {
      const client = getLineClient();
      const messagePayload = {
        type: 'flex',
        altText,
        contents: contents as never,
        ...(quickReplyItems ? {
          quickReply: {
            items: quickReplyItems.map((item) => ({
              type: 'action',
              action: {
                type: item.action,
                label: item.label,
                ...(item.action === 'message' && { text: item.text }),
                ...(item.action === 'postback' && { data: item.data }),
                ...(item.action === 'uri' && { uri: item.uri }),
              },
            })),
          },
        } : {}),
      } as never;
      const result = await client.pushMessage(userId, messagePayload);

      logger.info({
        type: 'line_flex_sent',
        userId,
        hasQuickReply: !!quickReplyItems,
      });

      return result;
    },
    options,
    () => payload
  );
}

/**
 * Quick reply item for LINE messages
 */
export interface QuickReplyItem {
  label: string;
  action: 'message' | 'postback' | 'uri';
  text?: string;   // for 'message' action
  data?: string;   // for 'postback' action
  uri?: string;    // for 'uri' action
}

/**
 * Send a text message to a user
 */
export async function sendLineMessage(
  userId: string,
  text: string,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const payload = { userId, text, options };
  return withRetry(
    async () => {
      const client = getLineClient();
      const result = await client.pushMessage(userId, {
        type: 'text',
        text,
      });

      logger.info({
        type: 'line_message_sent',
        userId,
        messageType: 'text',
      });

      return result;
    },
    options,
    () => payload
  );
}

/**
 * Send a text message with LINE quick reply buttons.
 * The quick reply buttons appear below the message in the LINE chat
 * and let the user tap to trigger an action without typing.
 */
export async function sendTextWithQuickReply(
  userId: string,
  text: string,
  quickReplyItems: QuickReplyItem[],
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const payload = { userId, text, quickReplyItems, options };
  return withRetry(
    async () => {
      const client = getLineClient();
      const result = await client.pushMessage(userId, {
        type: 'text',
        text,
        quickReply: {
          items: quickReplyItems.map((item) => ({
            type: 'action',
            action: {
              type: item.action,
              label: item.label,
              ...(item.action === 'message' && { text: item.text }),
              ...(item.action === 'postback' && { data: item.data }),
              ...(item.action === 'uri' && { uri: item.uri }),
            },
          })),
        },
      } as never);

      logger.info({
        type: 'line_quick_reply_sent',
        userId,
        quickReplyCount: quickReplyItems.length,
      });

      return result;
    },
    options,
    () => payload
  );
}

/**
 * Send an invoice message with detailed information
 */
export interface InvoiceMessageData {
  roomNumber: string;
  month: string;
  total: string;
  dueDate: string;
  invoiceUrl?: string;
}

export async function sendInvoiceMessage(
  userId: string,
  data: InvoiceMessageData,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const link = data.invoiceUrl ? `\n🔗 PDF: ${data.invoiceUrl}` : '';
  const message = `📄 Invoice for ${data.roomNumber} - ${data.month}

💰 Total: ${data.total}
📅 Due Date: ${data.dueDate}

Please review and complete your payment.${link}`;

  return sendLineMessage(userId, message, options);
}

/**
 * Send a payment reminder message
 */
export interface ReminderMessageData {
  roomNumber: string;
  month: string;
  amount: string;
  dueDate: string;
  daysOverdue?: number;
}

export async function sendReminderMessage(
  userId: string,
  data: ReminderMessageData,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const overdueText = data.daysOverdue
    ? `\n⚠️ This payment is ${data.daysOverdue} day(s) overdue!`
    : '';

  const message = `🔔 Payment Reminder for ${data.roomNumber} - ${data.month}

💰 Amount Due: ${data.amount}
📅 Due Date: ${data.dueDate}${overdueText}

Please complete your payment as soon as possible.`;

  return sendLineMessage(userId, message, options);
}

/**
 * Send an overdue notice
 */
export async function sendOverdueNotice(
  userId: string,
  data: ReminderMessageData,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const message = `⚠️ URGENT: Overdue Payment Notice for ${data.roomNumber}

💰 Amount Due: ${data.amount}
📅 Due Date: ${data.dueDate}
📅 Days Overdue: ${data.daysOverdue || 0}

Please contact us immediately to resolve this matter.`;

  return sendLineMessage(userId, message, options);
}

/**
 * Send a welcome message to a new tenant
 */
export async function sendWelcomeMessage(
  userId: string,
  roomNumber: string,
  tenantName: string,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const message = `👋 Welcome, ${tenantName}!

Thank you for choosing our apartment.

🏠 Room: ${roomNumber}

You will receive monthly invoices through this chat.
Feel free to message us if you have any questions.`;

  return sendLineMessage(userId, message, options);
}

/**
 * Send a custom message template
 */
export async function sendTemplateMessage(
  userId: string,
  altText: string,
  template: object,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const payload = { userId, altText, template, options };
  return withRetry(
    async () => {
      const client = getLineClient();
      const result = await client.pushMessage(userId, {
        type: 'template',
        altText,
        template: template as never,
      });

      logger.info({
        type: 'line_template_sent',
        userId,
      });

      return result;
    },
    options,
    () => payload
  );
}

/**
 * Get LINE user profile
 */
export async function getLineUserProfile(
  userId: string,
  options: LineMessageOptions = {}
): Promise<LineUserProfile> {
  return withRetry(
    async () => {
      const client = getLineClient();
      const profile = await client.getProfile(userId);

      return {
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || null,
        statusMessage: profile.statusMessage || null,
      };
    },
    options
  );
}

/**
 * Verify LINE webhook signature
 */
export function verifyLineSignature(body: string, signature: string): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    // LINE not configured — reject all webhooks since we cannot verify signatures
    return false;
  }

  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');

  return hash === signature;
}

/**
 * Parse LINE webhook event
 */
export function parseWebhookEvent(event: WebhookEvent): {
  userId: string | undefined;
  messageId: string | undefined;
  messageType: string | undefined;
  messageText: string | undefined;
  replyToken: string | undefined;
  timestamp: number;
} {
  const e = event as unknown as {
    source?: { userId?: string };
    message?: { id?: string; type?: string; text?: string };
    replyToken?: string;
    timestamp?: number;
  };
  return {
    userId: e.source?.userId,
    messageId: e.message?.id,
    messageType: e.message?.type,
    messageText: e.message?.text,
    replyToken: e.replyToken,
    timestamp: e.timestamp ?? Date.now(),
  };
}

/**
 * Send reply to a webhook event
 */
export async function sendReplyMessage(
  replyToken: string,
  text: string,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  return withRetry(
    async () => {
      const client = getLineClient();
      const result = await client.replyMessage(replyToken, {
        type: 'text',
        text,
      });

      logger.info({
        type: 'line_reply_sent',
        replyToken,
      });

      return result;
    },
    options
  );
}

/**
 * Send file message (PDF, DOCX, etc.)
 */
export async function sendLineFileMessage(
  userId: string,
  fileUrl: string,
  fileName: string,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const payload = { userId, fileUrl, fileName, options };
  return withRetry(
    async () => {
      const client = getLineClient();
      const result = await client.pushMessage(userId, {
        type: 'file',
        originalContentUrl: fileUrl,
        fileName,
      } as never);

      logger.info({
        type: 'line_file_sent',
        userId,
        fileName,
        fileUrl,
      });

      return result;
    },
    options,
    () => payload
  );
}

// Send image message — requires pre-upload to LINE CDN.
// Unlike file messages (which accept a direct URL), image messages must be
// uploaded first so LINE can return a messageId. Without CDN upload the image
// appears broken/thumbnailed in the LINE chat.
export async function sendLineImageMessage(
  userId: string,
  imageUrl: string,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const payload = { userId, imageUrl, options };
  return withRetry(
    async () => {
      // Download the image buffer first
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const mimeType = response.headers.get('content-type') ?? 'image/png';

      // Upload to LINE CDN to get a messageId
      const messageId = await uploadContentToLine(buffer, mimeType);
      const contentUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;

      const client = getLineClient();
      const result = await client.pushMessage(userId, {
        type: 'image',
        originalContentUrl: contentUrl,
        previewImageUrl: contentUrl,
      });

      logger.info({
        type: 'line_image_sent',
        userId,
        imageUrl,
        messageId,
      });

      return result;
    },
    options,
    () => payload
  );
}

/**
 * Returns true only when LINE is genuinely usable.
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

// ============================================================================
// Exports
// ============================================================================

export type {
  Client,
  ClientConfig,
  WebhookEvent,
  MessageAPIResponseBase,
};
