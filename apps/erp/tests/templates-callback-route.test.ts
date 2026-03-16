import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/onlyoffice/documents', () => ({
  downloadOnlyOfficeCallbackFile: vi.fn(async () => Buffer.from('<p>Updated body</p>', 'utf8')),
}));

const saveOnlyOfficeVersionBody = vi.fn(async () => null);

vi.mock('@/modules/documents/template.service', () => ({
  getDocumentTemplateService: () => ({
    saveOnlyOfficeVersionBody,
  }),
}));

describe('POST /api/templates/[id]/callback', () => {
  it('saves version content when ONLYOFFICE sends a completed callback', async () => {
    const mod = await import('@/app/api/templates/[id]/callback/route');
    const req = new Request('http://localhost/api/templates/tpl-1/callback?versionId=ver-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 2, url: 'https://docs.example.com/file/updated' }),
    });

    const res = await mod.POST(req as any, { params: { id: 'tpl-1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ error: 0 });
    expect(saveOnlyOfficeVersionBody).toHaveBeenCalledWith('tpl-1', 'ver-1', '<p>Updated body</p>');
  });
});
