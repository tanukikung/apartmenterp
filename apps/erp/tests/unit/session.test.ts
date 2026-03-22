import { describe, expect, it } from 'vitest';
import { signSessionToken, verifySessionToken, createResetToken, hashResetToken } from '@/lib/auth/session';
import { AdminRole } from '@prisma/client';

const TEST_SECRET = 'test-secret-key-for-unit-tests';

function createValidPayload(overrides: Partial<{
  sub: string;
  username: string;
  displayName: string;
  role: AdminRole;
  forcePasswordChange: boolean;
  exp: number;
}> = {}) {
  return {
    sub: 'user-123',
    username: 'owner',
    displayName: 'Test Owner',
    role: 'ADMIN' as AdminRole,
    forcePasswordChange: false,
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    ...overrides,
  };
}

describe('Session token', () => {
  describe('signSessionToken', () => {
    it('signs a valid session payload', () => {
      const payload = createValidPayload();
      const token = signSessionToken(payload, TEST_SECRET);
      expect(token).toBeTruthy();
      expect(token.split('.').length).toBe(2); // payload.signature
    });

    it('produces different tokens for different payloads', () => {
      const payload1 = createValidPayload({ sub: 'user-1' });
      const payload2 = createValidPayload({ sub: 'user-2' });
      const token1 = signSessionToken(payload1, TEST_SECRET);
      const token2 = signSessionToken(payload2, TEST_SECRET);
      expect(token1).not.toBe(token2);
    });
  });

  describe('verifySessionToken', () => {
    it('verifies a valid session', () => {
      const payload = createValidPayload();
      const token = signSessionToken(payload, TEST_SECRET);
      const verified = verifySessionToken(token, TEST_SECRET);
      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe(payload.sub);
      expect(verified?.username).toBe(payload.username);
      expect(verified?.role).toBe(payload.role);
    });

    it('returns null for tampered signature', () => {
      const payload = createValidPayload();
      const token = signSessionToken(payload, TEST_SECRET);
      const [payloadPart, signaturePart] = token.split('.');
      const tamperedToken = `${payloadPart}.${signaturePart}x`;
      const verified = verifySessionToken(tamperedToken, TEST_SECRET);
      expect(verified).toBeNull();
    });

    it('returns null for tampered payload', () => {
      const payload = createValidPayload();
      const token = signSessionToken(payload, TEST_SECRET);
      const [payloadPart, signaturePart] = token.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, sub: 'hacked' })).toString('base64url');
      const tamperedToken = `${tamperedPayload}.${signaturePart}`;
      const verified = verifySessionToken(tamperedToken, TEST_SECRET);
      expect(verified).toBeNull();
    });

    it('returns null for expired token', () => {
      const payload = createValidPayload({
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      });
      const token = signSessionToken(payload, TEST_SECRET);
      const verified = verifySessionToken(token, TEST_SECRET);
      expect(verified).toBeNull();
    });

    it('returns null for missing required fields', () => {
      const payload = createValidPayload({ sub: '' });
      const token = signSessionToken(payload, TEST_SECRET);
      const verified = verifySessionToken(token, TEST_SECRET);
      expect(verified).toBeNull();
    });

    it('returns null for missing role', () => {
      const payload = createValidPayload({ role: undefined as unknown as AdminRole });
      const token = signSessionToken(payload, TEST_SECRET);
      const verified = verifySessionToken(token, TEST_SECRET);
      expect(verified).toBeNull();
    });

    it('returns null for null secret', () => {
      const payload = createValidPayload();
      const token = signSessionToken(payload, TEST_SECRET);
      const verified = verifySessionToken(token, null);
      expect(verified).toBeNull();
    });

    it('returns null for malformed token (no dot)', () => {
      const verified = verifySessionToken('no-dots-here', TEST_SECRET);
      expect(verified).toBeNull();
    });

    it('returns null for token with wrong number of parts', () => {
      const verified = verifySessionToken('a.b.c', TEST_SECRET);
      expect(verified).toBeNull();
    });
  });

  describe('createResetToken / hashResetToken', () => {
    it('creates a random reset token and its hash', () => {
      const { rawToken, tokenHash } = createResetToken();
      expect(rawToken).toBeTruthy();
      expect(tokenHash).toBeTruthy();
      expect(tokenHash.length).toBe(64); // sha256 hex
    });

    it('hashes a raw token consistently', () => {
      const raw = 'test-raw-token-123';
      const hash1 = hashResetToken(raw);
      const hash2 = hashResetToken(raw);
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it('different raw tokens produce different hashes', () => {
      const hash1 = hashResetToken('token-a');
      const hash2 = hashResetToken('token-b');
      expect(hash1).not.toBe(hash2);
    });
  });
});
