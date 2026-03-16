import { describe, it, expect, vi } from 'vitest';
import { middleware } from '@/middleware';
import { NextResponse } from 'next/server';

function makeReq(url: string, method = 'GET', headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
  const h = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) h.set(k.toLowerCase(), v);
  return {
    url,
    method,
    headers: {
      get: (k: string) => h.get(k.toLowerCase()) || null,
    },
    cookies: {
      get: (k: string) => {
        const v = cookies[k];
        return v ? { name: k, value: v } : undefined;
      },
    },
  } as any;
}

describe('RBAC security', () => {
  it('tenant cannot access admin routes (middleware redirect)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const req = makeReq('https://example.com/admin/dashboard', 'GET', {}, { role: 'TENANT' });
    const res = (await middleware(req)) as NextResponse;
    vi.unstubAllEnvs();
    expect(res.status).toBe(307);
    const loc = res.headers.get('location');
    expect(loc).toBe('https://example.com/login');
  });
});
