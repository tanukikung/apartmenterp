import { describe, it, expect, vi } from 'vitest';
import { POST as uploadRoute } from '@/app/api/files/route';
import { prisma } from '@/lib/db/client';
import { getStorage } from '@/infrastructure/storage';

describe('POST /api/files', () => {
  it('rejects unsupported file types', async () => {
    const file = new File([new Uint8Array([1,2,3])], 'doc.exe', { type: 'application/x-msdownload' });
    const form = new FormData();
    form.append('file', file);
    const req: any = {
      formData: async () => form,
    };
    const res = await uploadRoute(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Unsupported file type/);
  });

  it('uploads and persists metadata', async () => {
    // Mock storage
    vi.spyOn(await import('@/infrastructure/storage'), 'getStorage').mockReturnValue({
      uploadFile: vi.fn(async ({ key }: { key: string }) => ({ key })),
    } as any);
    // Mock prisma
    vi.spyOn(prisma.uploadedFile, 'create').mockResolvedValue({
      id: 'f0000000-0000-0000-0000-000000000001',
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      size: 3,
      storageKey: 'chat-uploads/x/a.pdf',
      url: '/api/files/chat-uploads/x/a.pdf',
      uploadedBy: null,
      createdAt: new Date(),
    } as any);

    const file = new File([new Uint8Array([1,2,3])], 'a.pdf', { type: 'application/pdf' });
    const form = new FormData();
    form.append('file', file);
    const req: any = { formData: async () => form };
    const res = await uploadRoute(req as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('f0000000-0000-0000-0000-000000000001');
    expect(body.data.mimeType).toBe('application/pdf');
  });
});

