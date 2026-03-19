import { describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';
import { middleware } from '@/middleware';

function makeReq(
  url: string,
  method = 'POST',
  headers: Record<string, string> = {},
) {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    map.set(key.toLowerCase(), value);
  }

  return {
    url,
    method,
    headers: {
      get: (key: string) => map.get(key.toLowerCase()) || null,
    },
    cookies: {
      get: () => undefined,
    },
  } as any;
}

describe('CSRF origin hardening', () => {
  it('rejects state-changing requests when Origin and Referer are both missing', async () => {
    const req = makeReq('https://example.com/api/billing', 'POST', {
      host: 'example.com',
      'x-forwarded-proto': 'https',
    });

    const res = await middleware(req);

    expect(res.status).toBe(403);
  });

  it('rejects malformed Origin headers instead of failing open', async () => {
    const req = makeReq('https://example.com/api/billing', 'POST', {
      host: 'example.com',
      'x-forwarded-proto': 'https',
      origin: 'not a url',
    });

    const res = await middleware(req);

    expect(res.status).toBe(403);
  });

  it('allows valid same-origin state-changing requests', async () => {
    const req = makeReq('https://example.com/api/billing', 'POST', {
      host: 'example.com',
      'x-forwarded-proto': 'https',
      origin: 'https://example.com',
    });

    const res = (await middleware(req)) as NextResponse;

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('allows external LINE webhook posts without same-origin headers', async () => {
    const req = makeReq('https://example.com/api/line/webhook', 'POST', {
      host: 'example.com',
      'x-forwarded-proto': 'https',
    });

    const res = (await middleware(req)) as NextResponse;

    expect(res.status).toBe(200);
  });

  it('allows external OnlyOffice callback posts without same-origin headers', async () => {
    const req = makeReq('https://example.com/api/templates/tpl-1/callback?versionId=ver-1', 'POST', {
      host: 'example.com',
      'x-forwarded-proto': 'https',
    });

    const res = (await middleware(req)) as NextResponse;

    expect(res.status).toBe(200);
  });

  it('allows signed invoice view tracking posts without same-origin headers', async () => {
    const req = makeReq('https://example.com/api/invoices/inv-1/view?expires=123&token=signed', 'POST', {
      host: 'example.com',
      'x-forwarded-proto': 'https',
    });

    const res = (await middleware(req)) as NextResponse;

    expect(res.status).toBe(200);
  });
});
