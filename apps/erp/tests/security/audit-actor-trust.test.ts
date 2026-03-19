import { describe, it, expect, vi } from 'vitest';
import { makeRequestLike } from '../helpers/auth';

describe('Audit actor trust hardening', () => {
  it('ignores spoofed actor fields in request bodies and uses the verified session actor', async () => {
    const serviceModule = await import('@/modules/maintenance/maintenance.service');
    const route = await import('@/app/api/admin/maintenance/comment/route');

    const addComment = vi.fn(async (input: any) => ({
      id: 'comment-1',
      ticketId: input.ticketId,
      authorId: input.authorId,
      message: input.message,
    }));

    vi.spyOn(serviceModule, 'getMaintenanceService').mockReturnValue({
      addComment,
    } as any);

    const req = makeRequestLike({
      url: 'http://localhost/api/admin/maintenance/comment',
      method: 'POST',
      role: 'ADMIN',
      sessionOverrides: { sub: 'verified-admin' },
      body: {
        ticketId: '11111111-1111-1111-1111-111111111111',
        message: 'Investigating now',
        actorId: 'spoofed-actor',
        authorId: 'spoofed-author',
      },
    });

    const res = await route.POST(req as any);
    expect(res.status).toBe(201);
    expect(addComment).toHaveBeenCalledWith(
      {
        ticketId: '11111111-1111-1111-1111-111111111111',
        authorId: 'verified-admin',
        message: 'Investigating now',
      },
      'verified-admin',
    );
  });

  it('does not treat submitted tenantId as a verified audit actor on public maintenance create', async () => {
    const serviceModule = await import('@/modules/maintenance/maintenance.service');
    const route = await import('@/app/api/maintenance/create/route');

    const createTicket = vi.fn(async (input: any) => ({
      id: 'ticket-1',
      roomId: input.roomId,
      tenantId: input.tenantId,
      title: input.title,
      description: input.description,
      priority: input.priority,
    }));

    vi.spyOn(serviceModule, 'getMaintenanceService').mockReturnValue({
      createTicket,
    } as any);

    const req = makeRequestLike({
      url: 'http://localhost/api/maintenance/create',
      method: 'POST',
      body: {
        roomId: '11111111-1111-1111-1111-111111111111',
        tenantId: '22222222-2222-2222-2222-222222222222',
        title: 'Aircon broken',
        description: 'Not cooling',
        priority: 'HIGH',
      },
    });

    const res = await route.POST(req as any);
    expect(res.status).toBe(201);
    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: '22222222-2222-2222-2222-222222222222',
      }),
      {
        actorId: 'anonymous',
        actorRole: 'ANONYMOUS',
      },
    );
  });
});
