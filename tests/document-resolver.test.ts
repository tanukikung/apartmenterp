import { beforeEach, describe, expect, it } from 'vitest';
import { DocumentTemplateType } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getDocumentResolverService } from '@/modules/documents/resolver.service';

describe('document resolver service', () => {
  beforeEach(() => {
    (prisma.room.findMany as any).mockReset();
  });

  it('aggregates room, tenant, billing, invoice, and payment data into render context', async () => {
    (prisma.room.findMany as any).mockResolvedValue([
      {
        roomNo: '3201',
        floorNo: 3,
        roomStatus: 'VACANT',
        tenants: [
          {
            tenant: {
              id: 'tenant-1',
              firstName: 'Somchai',
              lastName: 'Jaidee',
              phone: '0891234567',
              email: null,
              lineUserId: 'U123',
            },
          },
        ],
        contracts: [
          {
            id: 'contract-1',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
            monthlyRent: 2900,
            deposit: 5000,
            furnitureFee: 0,
            status: 'ACTIVE',
            primaryTenant: {
              id: 'tenant-1',
              firstName: 'Somchai',
              lastName: 'Jaidee',
              phone: '0891234567',
              email: null,
              lineUserId: 'U123',
            },
          },
        ],
        billings: [
          {
            id: 'billing-1',
            billingPeriodId: 'cycle-1',
            roomNo: '3201',
            totalDue: 3696,
            rentAmount: 2900,
            waterTotal: 0,
            electricTotal: 0,
            furnitureFee: 0,
            otherFee: 0,
            status: 'INVOICED',
            billingPeriod: {
              id: 'cycle-1',
              year: 2026,
              month: 12,
              dueDay: 5,
              status: 'OPEN',
            },
            invoice: {
              id: 'invoice-1',
              status: 'GENERATED',
              paymentTransactions: [
                {
                  amount: 3696,
                  transactionDate: new Date('2026-12-02'),
                  status: 'CONFIRMED',
                },
              ],
              deliveries: [],
            },
          },
        ],
      },
    ]);

    const service = getDocumentResolverService();
    const targets = await service.resolveTargets(
      {
        templateId: 'tpl-1',
        scope: 'SINGLE_ROOM',
        roomId: '3201',
        roomIds: [],
        year: 2026,
        month: 12,
        onlyOccupiedRooms: false,
        onlyRoomsWithBillingRecord: false,
        includeZipBundle: false,
        dryRun: true,
      },
      DocumentTemplateType.INVOICE,
      'admin-1',
    );

    expect(targets).toHaveLength(1);
    expect(targets[0]?.context.room.number).toBe('3201');
    expect(targets[0]?.context.tenant?.fullName).toBe('Somchai Jaidee');
    expect(targets[0]?.context.billing?.invoiceNumber).toContain('INV-2026-12-3201');
    expect(targets[0]?.context.payment.totalConfirmed).toBe(3696);
  });
});
