import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFileAccessUrl, verifySignedFileAccess } from '@/lib/files/access';
import { prisma } from '@/lib/db/client';
import { makeRequestLike } from '../helpers/auth';

describe('File and messaging route security', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('denies anonymous file downloads but allows signed short-lived URLs', async () => {
    const route = await import('@/app/api/files/[...key]/route');
    const downloadFile = vi.fn(async () => Buffer.from('file-bytes'));
    vi.spyOn(await import('@/infrastructure/storage'), 'getStorage').mockReturnValue({
      downloadFile,
    } as any);

    const anonymous = await route.GET(
      makeRequestLike({
        url: 'http://localhost/api/files/chat-uploads/x/a.pdf?inline=1',
        method: 'GET',
      }) as any,
      { params: { key: ['chat-uploads', 'x', 'a.pdf'] } } as any,
    );
    expect(anonymous.status).toBe(401);
    expect(downloadFile).not.toHaveBeenCalled();

    const signedUrl = buildFileAccessUrl('chat-uploads/x/a.pdf', {
      absoluteBaseUrl: 'http://localhost',
      inline: true,
      signed: true,
    });
    const signed = await route.GET(
      makeRequestLike({
        url: signedUrl,
        method: 'GET',
      }) as any,
      { params: { key: ['chat-uploads', 'x', 'a.pdf'] } } as any,
    );
    expect(signed.status).toBe(200);
    expect(downloadFile).toHaveBeenCalledTimes(1);
  });

  it('denies unauthenticated outbound file sends', async () => {
    const route = await import('@/app/api/messages/send-file/route');
    const res = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/messages/send-file',
        method: 'POST',
        body: {
          conversationId: '11111111-1111-1111-1111-111111111111',
          fileId: '22222222-2222-2222-2222-222222222222',
        },
      }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('allows authenticated operators to enqueue outbound file sends', async () => {
    const route = await import('@/app/api/messages/send-file/route');
    const line = await import('@/lib/line');
    vi.mocked(line.isLineConfigured).mockReturnValue(true);
    vi.spyOn(prisma.conversation, 'findUnique').mockResolvedValue({
      id: 'conv-validation-ready',
      lineUserId: 'U123',
    } as any);
    vi.spyOn(prisma.uploadedFile, 'findUnique').mockResolvedValue(null as any);
    vi.spyOn(prisma.message, 'create').mockResolvedValue({
      id: 'msg-1',
    } as any);
    vi.spyOn(prisma.conversation, 'update').mockResolvedValue({} as any);
    vi.spyOn(prisma.outboxEvent, 'create').mockResolvedValue({ id: 'evt-1' } as any);

    const res = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/messages/send-file',
        method: 'POST',
        role: 'ADMIN',
        body: {
          conversationId: 'conv-validation-ready',
          fileId: 'chat-uploads/x/a.pdf',
          name: 'invoice.pdf',
          contentType: 'application/pdf',
        },
      }) as any,
    );

    expect(res.status).toBe(202);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('fails closed for signed file access in production when secrets are missing', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFileSecret = process.env.FILE_ACCESS_SECRET;
    const originalAuthSecret = process.env.AUTH_SECRET;
    const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;
    const originalAdminToken = process.env.ADMIN_TOKEN;

    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.FILE_ACCESS_SECRET;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.ADMIN_TOKEN;

    expect(() =>
      buildFileAccessUrl('chat-uploads/x/a.pdf', {
        absoluteBaseUrl: 'http://localhost',
        signed: true,
      }),
    ).toThrow(/FILE_ACCESS_SECRET/i);
    expect(
      verifySignedFileAccess({
        storageKey: 'chat-uploads/x/a.pdf',
        inline: false,
        expiresAt: Date.now() + 60_000,
        token: 'forged',
      }),
    ).toBe(false);

    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    process.env.FILE_ACCESS_SECRET = originalFileSecret;
    process.env.AUTH_SECRET = originalAuthSecret;
    process.env.NEXTAUTH_SECRET = originalNextAuthSecret;
    process.env.ADMIN_TOKEN = originalAdminToken;
  });
});
