import { describe, it, expect, vi } from 'vitest';
import { POST as uploadRoute } from '@/app/api/files/route';

describe('POST /api/files size limits', () => {
  it('rejects oversized uploads based on FILE_MAX_UPLOAD_MB', async () => {
    const old = process.env.FILE_MAX_UPLOAD_MB;
    process.env.FILE_MAX_UPLOAD_MB = '1'; // 1MB
    try {
      const big = new Uint8Array(1_200_000); // ~1.2MB
      const file = new File([big], 'b.pdf', { type: 'application/pdf' });
      const form = new FormData();
      form.append('file', file);
      const req: any = { formData: async () => form };
      const res = await uploadRoute(req as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(String(body.error)).toMatch(/File too large/);
    } finally {
      if (old === undefined) delete process.env.FILE_MAX_UPLOAD_MB;
      else process.env.FILE_MAX_UPLOAD_MB = old;
    }
  });
});

