import { describe, expect, it } from 'vitest';
import { DocumentFieldCategory, DocumentFieldValueType } from '@prisma/client';
import { renderTemplateHtml, validateRequiredFields } from '@/modules/documents/render.service';
import type { DocumentRenderContext } from '@/modules/documents/resolver.service';
import type { DocumentTemplateFieldResponse } from '@/modules/documents/types';

const context: DocumentRenderContext = {
  room: {
    id: 'room-1',
    number: '3201',
    floorNumber: 3,
    status: 'OCCUPIED',
    billingStatus: 'BILLABLE',
    usageType: 'RENTAL',
    maxResidents: 2,
  },
  tenant: {
    id: 'tenant-1',
    firstName: 'Somchai',
    lastName: 'Jaidee',
    fullName: 'Somchai Jaidee',
    phone: '0891234567',
    email: null,
    lineUserId: 'U123',
  },
  contract: null,
  billing: {
    recordId: 'billing-1',
    billingCycleId: 'cycle-1',
    year: 2026,
    month: 12,
    subtotal: 3696,
    total: 3696,
    dueDate: '2026-12-05',
    billingDay: 1,
    dueDay: 5,
    overdueDay: 10,
    status: 'INVOICED',
    invoiceId: 'invoice-1',
    invoiceNumber: 'INV-2026-12-3201',
    invoiceStatus: 'GENERATED',
    waterUnits: 15,
    waterUsageCharge: 300,
    waterServiceFee: 30,
    waterTotal: 330,
    electricUnits: 250,
    electricUsageCharge: 996,
    electricServiceFee: 300,
    electricTotal: 1296,
    rentAmount: 2900,
    furnitureFee: 0,
    otherFee: 0,
    waterPrev: 1200,
    waterCurr: 1215,
    electricPrev: 5000,
    electricCurr: 5250,
  },
  billingItems: [
    {
      typeCode: 'RENT',
      typeName: 'Rent',
      description: null,
      quantity: 1,
      unitPrice: 2900,
      unitPriceFormatted: 'THB 2,900.00',
      amount: 2900,
      amountFormatted: 'THB 2,900.00',
    },
    {
      typeCode: 'WATER',
      typeName: 'Water',
      description: null,
      quantity: 1,
      unitPrice: 200,
      unitPriceFormatted: 'THB 200.00',
      amount: 200,
      amountFormatted: 'THB 200.00',
    },
  ],
  payment: {
    status: 'PENDING',
    lastPaidAt: null,
    totalConfirmed: 0,
    totalConfirmedFormatted: 'THB 0.00',
  },
  apartment: {
    id: 'building-1',
    name: 'Apartment ERP Residence',
    address: '123 Demo Road',
  },
  system: {
    generatedAt: '2026-12-01T08:00:00.000Z',
    generatedById: 'admin-1',
  },
  computed: {
    billingMonthLabel: 'December 2026',
    dueDateLabel: '05 December 2026',
    occupancyDisplay: 'Somchai Jaidee',
    totalAmountFormatted: 'THB 3,696.00',
    invoiceNumber: 'INV-2026-12-3201',
    qrPayload: 'payload',
  },
};

const fields: DocumentTemplateFieldResponse[] = [
  {
    key: 'room.number',
    label: 'Room Number',
    category: DocumentFieldCategory.ROOM,
    valueType: DocumentFieldValueType.STRING,
    path: 'room.number',
    description: null,
    isRequired: true,
    isCollection: false,
    sampleValue: '3201',
    sortOrder: 1,
  },
  {
    key: 'billing_items',
    label: 'Billing Items',
    category: DocumentFieldCategory.BILLING_ITEM,
    valueType: DocumentFieldValueType.ARRAY,
    path: 'billingItems',
    description: null,
    isRequired: false,
    isCollection: true,
    sampleValue: null,
    sortOrder: 2,
  },
];

describe('document renderer', () => {
  it('renders scalar and repeat bindings', () => {
    const template = `
      <div>
        <h1>Room <span data-template-field="room.number">{{room.number}}</span></h1>
        <tbody data-template-repeat="billing_items">
          <tr>
            <td><span data-template-field="typeName">{{billing_items.typeName}}</span></td>
            <td><span data-template-field="amountFormatted">{{billing_items.amountFormatted}}</span></td>
          </tr>
        </tbody>
      </div>
    `;

    const rendered = renderTemplateHtml(template, context, fields);
    expect(rendered.html).toContain('3201');
    expect(rendered.html).toContain('Rent');
    expect(rendered.html).toContain('THB 2,900.00');
    expect(rendered.missingFields).toHaveLength(0);
  });

  it('reports missing required fields clearly', () => {
    const brokenContext: DocumentRenderContext = {
      ...context,
      room: {
        ...context.room,
        number: '',
      },
    };

    const missing = validateRequiredFields(brokenContext, fields);
    expect(missing).toEqual([
      expect.objectContaining({ key: 'room.number' }),
    ]);
  });
});
