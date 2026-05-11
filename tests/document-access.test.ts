import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash, randomBytes } from 'crypto';

// ── Mock infrastructure ──────────────────────────────────────────────────────

vi.mock('@/infrastructure/storage', () => ({
  getStorage: vi.fn(() => ({
    downloadFile: vi.fn().mockResolvedValue(Buffer.from('PDF content here')),
  })),
}));

vi.mock('@/modules/audit', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DocumentAccessToken service', () => {
  describe('token creation', () => {
    it('creates high-entropy raw token (32 bytes base64url)', async () => {
      const { createDocumentAccessToken } = await import('@/modules/documents/document-access.service');

      // Capture what is stored in DB (not the raw token)
      const { prisma } = await import('@/lib/db/client');
      const createSpy = vi.spyOn(prisma.documentAccessToken, 'create');

      const result = await createDocumentAccessToken({ invoiceId: 'test-inv-1' });

      // Raw token should be base64url encoded
      expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes → 43 base64url chars
      expect(result.tokenUrl).toContain('/d/');
      expect(result.tokenUrl).toMatch(/^https?:\/\//);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(createSpy).toHaveBeenCalled();
    });

    it('stores sha256 hash of token in DB, never raw token', async () => {
      const { createDocumentAccessToken } = await import('@/modules/documents/document-access.service');
      const { prisma } = await import('@/lib/db/client');
      const createSpy = vi.spyOn(prisma.documentAccessToken, 'create');

      const { rawToken } = await createDocumentAccessToken({ invoiceId: 'test-inv-2' });

      const callData = createSpy.mock.calls[0][0];
      const storedHash = callData.data.tokenHash;
      const expectedHash = createHash('sha256').update(rawToken).digest('hex');

      expect(storedHash).toBe(expectedHash);
      expect(storedHash).not.toBe(rawToken);
      expect(storedHash).toHaveLength(64); // sha256 hex = 64 chars
    });

    it('returns APP_BASE_URL/d/<token> format', async () => {
      const { createDocumentAccessToken } = await import('@/modules/documents/document-access.service');

      const result = await createDocumentAccessToken({ invoiceId: 'test-inv-3' });

      expect(result.tokenUrl).toMatch(/^https?:\/\/[^\/]+\/d\/[A-Za-z0-9_-]+$/);
    });

    it('respects DOCUMENT_LINK_TTL_DAYS env var for expiry', async () => {
      vi.stubEnv('DOCUMENT_LINK_TTL_DAYS', '7');
      const { createDocumentAccessToken } = await import('@/modules/documents/document-access.service');

      const result = await createDocumentAccessToken({ invoiceId: 'test-inv-4' });

      const expectedExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const actualExpiry = result.expiresAt!.getTime();
      expect(Math.abs(actualExpiry - expectedExpiry.getTime())).toBeLessThan(5000); // within 5s
    });

    it('scopes token to the provided invoiceId', async () => {
      const { createDocumentAccessToken } = await import('@/modules/documents/document-access.service');
      const { prisma } = await import('@/lib/db/client');
      const createSpy = vi.spyOn(prisma.documentAccessToken, 'create');

      await createDocumentAccessToken({ invoiceId: 'inv-abc123', purpose: 'LINE_INVOICE_DOWNLOAD' });

      const callData = createSpy.mock.calls[0][0];
      expect(callData.data.invoiceId).toBe('inv-abc123');
      expect(callData.data.purpose).toBe('LINE_INVOICE_DOWNLOAD');
    });
  });

  describe('token verification', () => {
    it('returns null for non-existent token', async () => {
      const { verifyDocumentAccessToken } = await import('@/modules/documents/document-access.service');
      const result = await verifyDocumentAccessToken('non-existent-token');
      expect(result).toBeNull();
    });

    it('returns null for expired token', async () => {
      const { createDocumentAccessToken, verifyDocumentAccessToken } = await import('@/modules/documents/document-access.service');
      const { prisma } = await import('@/lib/db/client');

      // Create token that expired yesterday
      const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      await prisma.documentAccessToken.create({
        data: { tokenHash, invoiceId: 'expired-test', expiresAt: pastExpiry },
      });

      const result = await verifyDocumentAccessToken(rawToken);
      expect(result).toBeNull();
    });

    it('returns null for revoked token', async () => {
      const { createDocumentAccessToken, verifyDocumentAccessToken } = await import('@/modules/documents/document-access.service');
      const { prisma } = await import('@/lib/db/client');

      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      await prisma.documentAccessToken.create({
        data: { tokenHash, invoiceId: 'revoked-test', revokedAt: new Date() },
      });

      const result = await verifyDocumentAccessToken(rawToken);
      expect(result).toBeNull();
    });
  });
});