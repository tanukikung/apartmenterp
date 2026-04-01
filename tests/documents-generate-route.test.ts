import { describe, expect, it, vi } from 'vitest';
import { makeRequestLike } from './helpers/auth';

const previewGeneration = vi.fn(async () => ({
  templateId: 'tpl-1',
  templateVersionId: 'ver-1',
  scope: 'SELECTED_ROOMS',
  totalRequested: 2,
  readyCount: 2,
  skippedCount: 0,
  failedCount: 0,
  targets: [
    { roomId: 'room-1', roomNumber: '3201', floorNumber: 3, tenantName: 'A', billingRecordId: 'b1', invoiceId: 'i1', status: 'READY', reason: null },
    { roomId: 'room-2', roomNumber: '3202', floorNumber: 3, tenantName: 'B', billingRecordId: 'b2', invoiceId: 'i2', status: 'READY', reason: null },
  ],
}));

const generateDocuments = vi.fn(async () => ({
  id: 'job-1',
  templateId: 'tpl-1',
  templateVersionId: 'ver-1',
  scope: 'SELECTED_ROOMS',
  status: 'COMPLETED',
  totalRequested: 2,
  successCount: 2,
  skippedCount: 0,
  failedCount: 0,
  billingCycleId: null,
  year: 2026,
  month: 12,
  bundleUrl: null,
  targets: [],
}));

vi.mock('@/modules/documents/generation.service', () => ({
  getDocumentGenerationService: () => ({
    previewGeneration,
    generateDocuments,
  }),
}));

describe('POST /api/documents/generate', () => {
  it('returns dry-run preview when dryRun=true', async () => {
    const mod = await import('@/app/api/documents/generate/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/documents/generate',
      method: 'POST',
      role: 'ADMIN',
      headers: { 'Content-Type': 'application/json' },
      body: {
        templateId: 'tpl-1',
        scope: 'SELECTED_ROOMS',
        roomIds: ['room-1', 'room-2'],
        year: 2026,
        month: 12,
        dryRun: true,
      },
    });

    const res = await mod.POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(previewGeneration).toHaveBeenCalled();
    expect(generateDocuments).not.toHaveBeenCalled();
  });

  it('runs actual generation when dryRun=false', async () => {
    const mod = await import('@/app/api/documents/generate/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/documents/generate',
      method: 'POST',
      role: 'ADMIN',
      headers: { 'Content-Type': 'application/json' },
      body: {
        templateId: 'tpl-1',
        scope: 'SELECTED_ROOMS',
        roomIds: ['room-1', 'room-2'],
        year: 2026,
        month: 12,
        dryRun: false,
      },
    });

    const res = await mod.POST(req as any);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(generateDocuments).toHaveBeenCalled();
  });
});
