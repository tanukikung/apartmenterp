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
// LINE Client Wrapper
// ============================================================================

class LineClientWrapper {
  private client: Client | null = null;
  private config: LineConfig | null = null;

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
   * Get LINE configuration from environment
   */
  getConfig(): LineConfig {
    if (this.config) {
      return this.config;
    }

    const channelId = process.env.LINE_CHANNEL_ID;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
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
}

// Singleton instance
const lineClientWrapper = new LineClientWrapper();

// ============================================================================
// Retry Logic
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  options: LineMessageOptions = {}
): Promise<T> {
  const maxRetries = options.retryCount ?? 3;
  const baseDelay = options.retryDelay ?? 1000;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
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
 * Send a flex message
 */
export async function sendFlexMessage(
  userId: string,
  altText: string,
  contents: object,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  return withRetry(
    async () => {
      const client = getLineClient();
      const result = await client.pushMessage(userId, {
        type: 'flex',
        altText,
        contents: contents as never,
      });

      logger.info({
        type: 'line_flex_sent',
        userId,
      });

      return result;
    },
    options
  );
}

/**
 * Send a text message to a user
 */
export async function sendLineMessage(
  userId: string,
  text: string,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
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
    options
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
    options
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
    options
  );
}

// Send image message
export async function sendLineImageMessage(
  userId: string,
  imageUrl: string,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  return withRetry(
    async () => {
      const client = getLineClient();
      const result = await client.pushMessage(userId, {
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl,
      });

      logger.info({
        type: 'line_image_sent',
        userId,
        imageUrl,
      });

      return result;
    },
    options
  );
}

/**
 * Check if LINE is configured
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
