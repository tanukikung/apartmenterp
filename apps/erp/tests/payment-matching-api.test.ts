import { describe, it, expect, vi } from 'vitest';
import { signSessionToken } from '@/lib/auth/session';

const confirmMock = vi.fn();
const rejectMock = vi.fn();
const importMock = vi.fn().mockResolvedValue({ imported: 2, matched: 1 });

vi.mock('@/modules/payments/bank-statement-parser', () => {
  return {
    bankStatementParser: {
      parseCSV: vi.fn().mockReturnValue([
        { date: new Date('2026-03-01'), amount: 1200, description: 'INV-2026-001', reference: 'ABC' },
        { date: new Date('2026-03-02'), amount: 1500, description: 'Room 101', reference: 'DEF' },
      ]),
      parseExcel: vi.fn().mockReturnValue([]),
    },
  };
});

vi.mock('@/modules/payments/payment-matching.service', () => {
  return {
    getPaymentMatchingService: () => ({
      importBankStatement: importMock,
      confirmMatch: confirmMock,
      rejectMatch: rejectMock,
    }),
  };
});

describe('Payment Matching API', () => {
  it('imports bank statement and returns counts', async () => {
    const mod = await import('@/app/api/payments/import/route');
    const fakeFile = {
      name: 'statement.csv',
      size: 100,
      arrayBuffer: async () => Buffer.from('date,amount\n2026-03-01,1200'),
    };
    const req: any = {
      formData: async () => ({
        get: (k: string) => (k === 'file' ? (fakeFile as unknown as File) : null),
      }),
      cookies: makeCookieStore('ADMIN'),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.data.imported).toBe(2);
    expect(json.data.matched).toBe(1);
    expect(importMock).toHaveBeenCalled();
  });

  it('returns a validation error for malformed statement files', async () => {
    const parser = await import('@/modules/payments/bank-statement-parser');
    vi.mocked(parser.bankStatementParser.parseCSV).mockImplementationOnce(() => {
      throw new Error('Invalid CSV format');
    });

    const mod = await import('@/app/api/payments/import/route');
    const fakeFile = {
      name: 'statement.csv',
      size: 100,
      arrayBuffer: async () => Buffer.from('bad-content'),
    };
    const req: any = {
      formData: async () => ({
        get: (k: string) => (k === 'file' ? (fakeFile as unknown as File) : null),
      }),
      cookies: makeCookieStore('ADMIN'),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.message).toContain('Invalid statement file');
  });

  it('confirms a match', async () => {
    const mod = await import('@/app/api/payments/match/confirm/route');
    const body = { transactionId: '11111111-1111-1111-1111-111111111111', invoiceId: '22222222-2222-2222-2222-222222222222' };
    const req: any = { 
      json: async () => body,
      cookies: makeCookieStore('ADMIN'),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    expect(confirmMock).toHaveBeenCalledWith(body.transactionId, body.invoiceId, 'test-admin');
  });

  it('rejects a match', async () => {
    const mod = await import('@/app/api/payments/match/reject/route');
    const body = { transactionId: '11111111-1111-1111-1111-111111111111', rejectReason: 'Mismatch' };
    const req: any = { 
      json: async () => body,
      cookies: makeCookieStore('STAFF'),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    expect(rejectMock).toHaveBeenCalledWith(body.transactionId, 'test-staff', 'Mismatch');
  });
});

function makeCookieStore(role: 'ADMIN' | 'STAFF') {
  const token = signSessionToken({
    sub: `test-${role.toLowerCase()}`,
    username: `${role.toLowerCase()}-user`,
    displayName: `${role} User`,
    role,
    forcePasswordChange: false,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  });

  const cookies: Record<string, string> = {
    auth_session: token,
    role,
  };

  return {
    get: (key: string) => {
      const value = cookies[key];
      return value ? { name: key, value } : undefined;
    },
  };
}
