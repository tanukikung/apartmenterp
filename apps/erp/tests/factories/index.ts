import { v4 as uuidv4 } from 'uuid';

export function createRoom(overrides: Partial<any> = {}) {
  return {
    id: uuidv4(),
    roomNumber: '101',
    status: 'VACANT',
    floorId: uuidv4(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createInvoice(overrides: Partial<any> = {}) {
  return {
    id: uuidv4(),
    roomId: uuidv4(),
    billingRecordId: uuidv4(),
    year: 2026,
    month: 3,
    version: 1,
    status: 'GENERATED',
    subtotal: 1000,
    total: 1000,
    dueDate: new Date(),
    issuedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createPaymentTransaction(overrides: Partial<any> = {}) {
  return {
    id: uuidv4(),
    amount: 1000,
    paidAt: new Date(),
    description: 'PROMPTPAY',
    reference: 'REF-1',
    status: 'CONFIRMED',
    matchedInvoiceId: uuidv4(),
    confirmedAt: new Date(),
    confirmedBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
