import { describe, it, expect, vi } from 'vitest';

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
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.data.imported).toBe(2);
    expect(json.data.matched).toBe(1);
    expect(importMock).toHaveBeenCalled();
  });

  it('confirms a match', async () => {
    const mod = await import('@/app/api/payments/match/confirm/route');
    const body = { transactionId: '11111111-1111-1111-1111-111111111111', invoiceId: '22222222-2222-2222-2222-222222222222' };
    const req: any = { 
      json: async () => body,
      cookies: { get: (k: string) => ({ name: k, value: 'ADMIN' }) },
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    expect(confirmMock).toHaveBeenCalledWith(body.transactionId, body.invoiceId, 'system');
  });

  it('rejects a match', async () => {
    const mod = await import('@/app/api/payments/match/reject/route');
    const body = { transactionId: '11111111-1111-1111-1111-111111111111', rejectReason: 'Mismatch' };
    const req: any = { 
      json: async () => body,
      cookies: { get: (k: string) => ({ name: k, value: 'STAFF' }) },
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    expect(rejectMock).toHaveBeenCalledWith(body.transactionId, 'system', 'Mismatch');
  });
});
