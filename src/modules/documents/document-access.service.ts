import { createHash, randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';

/**
 * Purpose values for document access tokens.
 */
export const DOCUMENT_ACCESS_PURPOSE = {
  LINE_INVOICE_DOWNLOAD: 'LINE_INVOICE_DOWNLOAD',
  LINE_DOCUMENT_DOWNLOAD: 'LINE_DOCUMENT_DOWNLOAD',
  LINE_RECEIPT_DOWNLOAD: 'LINE_RECEIPT_DOWNLOAD',
} as const;
export type DocumentAccessPurpose =
  (typeof DOCUMENT_ACCESS_PURPOSE)[keyof typeof DOCUMENT_ACCESS_PURPOSE];

export interface CreateDocumentAccessTokenInput {
  documentId?: string;
  invoiceId?: string;
  purpose?: DocumentAccessPurpose;
  expiresInDays?: number;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentAccessTokenRecord {
  id: string;
  tokenHash: string;
  documentId: string | null;
  invoiceId: string | null;
  purpose: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  useCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
  metadata: Record<string, unknown> | null;
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function buildTokenUrl(rawToken: string): string {
  const baseUrl = (process.env.APP_BASE_URL || 'https://apartmentbotsystem.space').replace(/\/+$/, '');
  return `${baseUrl}/d/${rawToken}`;
}

/**
 * Generate a high-entropy cryptographically secure token and store its hash.
 * Returns the raw token (must be transmitted to the user securely).
 */
export async function createDocumentAccessToken(
  input: CreateDocumentAccessTokenInput,
): Promise<{ rawToken: string; tokenUrl: string; expiresAt: Date | null }> {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);

  let expiresAt: Date | null = null;
  if (input.expiresInDays != null) {
    expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  } else {
    // Default: 60 days if not specified
    const defaultDays = Number(process.env.DOCUMENT_LINK_TTL_DAYS || 60);
    expiresAt = new Date(Date.now() + defaultDays * 24 * 60 * 60 * 1000);
  }

  await prisma.documentAccessToken.create({
    data: {
      tokenHash,
      documentId: input.documentId ?? null,
      invoiceId: input.invoiceId ?? null,
      purpose: input.purpose ?? DOCUMENT_ACCESS_PURPOSE.LINE_DOCUMENT_DOWNLOAD,
      expiresAt,
      createdBy: input.createdBy ?? null,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue,
    },
  });

  return { rawToken, tokenUrl: buildTokenUrl(rawToken), expiresAt };
}

/**
 * Verify a raw token and return the token record if valid.
 * Returns null if token is missing, expired, or revoked.
 */
export async function verifyDocumentAccessToken(
  rawToken: string,
): Promise<DocumentAccessTokenRecord | null> {
  const tokenHash = hashToken(rawToken);

  const record = await prisma.documentAccessToken.findUnique({
    where: { tokenHash },
  });

  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  return record as DocumentAccessTokenRecord;
}

/**
 * Mark a token as used (increment useCount, update lastUsedAt).
 */
export async function markTokenUsed(tokenId: string): Promise<void> {
  await prisma.documentAccessToken.update({
    where: { id: tokenId },
    data: {
      useCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

/**
 * Revoke a token by its ID.
 */
export async function revokeDocumentAccessToken(tokenId: string): Promise<void> {
  await prisma.documentAccessToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke all tokens for a given documentId.
 */
export async function revokeTokensForDocument(documentId: string): Promise<number> {
  const result = await prisma.documentAccessToken.updateMany({
    where: { documentId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * Revoke all tokens for a given invoiceId.
 */
export async function revokeTokensForInvoice(invoiceId: string): Promise<number> {
  const result = await prisma.documentAccessToken.updateMany({
    where: { invoiceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}