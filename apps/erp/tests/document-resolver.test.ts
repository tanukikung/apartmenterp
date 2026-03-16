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
        id: 'room-1',
        roomNumber: '3201',
        status: 'OCCUPIED',
        billingStatus: 'BILLABLE',
        usageType: 'RENTAL',
        maxResidents: 2,
        floor: {
          floorNumber: 3,
          building: {
            id: 'building-1',
            name: 'Apartment ERP Residence',
            address: '123 Demo Road',
          },
        },
        roomTenants: [
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
        billingRecords: [
          {
            id: 'billing-1',
            billingCycleId: 'cycle-1',
            year: 2026,
            month: 12,
            subtotal: 3696,
            total: 3696,
            billingDay: 1,
            dueDay: 5,
            overdueDay: 10,
            status: 'INVOICED',
            items: [
              {
                quantity: 1,
                unitPrice: 2900,
                amount: 2900,
                description: null,
                itemType: {
                  code: 'RENT',
                  name: 'Rent',
                },
              },
            ],
            invoices: [
              {
                id: 'invoice-1',
                version: 1,
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
            ],
          },
        ],
      },
    ]);

    const service = getDocumentResolverService();
    const targets = await service.resolveTargets(
      {
        templateId: 'tpl-1',
        scope: 'SINGLE_ROOM',
        roomId: 'room-1',
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
    expect(targets[0]?.context.apartment.name).toBe('Apartment ERP Residence');
  });
});
