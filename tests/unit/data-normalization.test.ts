/**
 * Unit tests for data normalization utilities (Phase 3)
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeDate,
  normalizeMoney,
  normalizePhone,
  normalizeRoomStatus,
  normalizeTenant,
  normalizeInvoice,
  normalizeContract,
  normalizePayment,
  normalizeRoom,
  removeDuplicateFields,
  STATUS_NORMALIZATION,
} from '@/lib/data-normalization';

describe('Data Normalization', () => {
  describe('normalizeDate', () => {
    it('should convert date strings to ISO format', () => {
      const result = normalizeDate('2024-01-15');
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('should convert Date objects to ISO format', () => {
      const date = new Date('2024-01-15');
      const result = normalizeDate(date);
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('should return null for null/undefined', () => {
      expect(normalizeDate(null)).toBeNull();
      expect(normalizeDate(undefined)).toBeNull();
    });
  });

  describe('normalizeMoney', () => {
    it('should convert to satang (100ths)', () => {
      const result = normalizeMoney(100.50);
      expect(result).toBe(10050);
    });

    it('should handle integers', () => {
      const result = normalizeMoney(100);
      expect(result).toBe(10000);
    });

    it('should return 0 for null/undefined', () => {
      expect(normalizeMoney(null)).toBe(0);
      expect(normalizeMoney(undefined)).toBe(0);
    });

    it('should round properly', () => {
      const result = normalizeMoney(100.555);
      expect(result).toBe(10056);
    });
  });

  describe('normalizePhone', () => {
    it('should extract 10 digits', () => {
      const result = normalizePhone('+66-812-345-678');
      expect(result).toBe('0812345678');
    });

    it('should remove non-numeric characters', () => {
      const result = normalizePhone('(081) 234-5678');
      expect(result).toBe('0812345678');
    });

    it('should return empty for null', () => {
      expect(normalizePhone('')).toBe('');
    });
  });

  describe('normalizeRoomStatus', () => {
    it('should mark as OCCUPIED if contracts exist', () => {
      const status = normalizeRoomStatus(1, false);
      expect(status).toBe('OCCUPIED');
    });

    it('should mark as VACANT if no contracts', () => {
      const status = normalizeRoomStatus(0, false);
      expect(status).toBe('VACANT');
    });

    it('should mark as MAINTENANCE if in maintenance', () => {
      const status = normalizeRoomStatus(1, true);
      expect(status).toBe('MAINTENANCE');
    });
  });

  describe('status normalization', () => {
    it('should normalize invoice status', () => {
      expect(STATUS_NORMALIZATION.invoice('DRAFT')).toBe('GENERATED');
      expect(STATUS_NORMALIZATION.invoice('PAID')).toBe('PAID');
    });

    it('should normalize payment status', () => {
      expect(STATUS_NORMALIZATION.payment('PENDING')).toBe('PENDING');
      expect(STATUS_NORMALIZATION.payment('MATCHED')).toBe('MATCHED');
    });

    it('should normalize contract status', () => {
      expect(STATUS_NORMALIZATION.contract('ACTIVE')).toBe('ACTIVE');
      expect(STATUS_NORMALIZATION.contract('pending')).toBe('PENDING');
    });

    it('should normalize billing status', () => {
      expect(STATUS_NORMALIZATION.billing('OPEN')).toBe('OPEN');
      expect(STATUS_NORMALIZATION.billing('locked')).toBe('LOCKED');
    });
  });

  describe('removeDuplicateFields', () => {
    it('should remove specified fields', () => {
      const data = { id: '1', name: 'Test', computed: 'value' };
      const result = removeDuplicateFields(data, ['computed']);
      expect(result).not.toHaveProperty('computed');
      expect(result).toHaveProperty('id');
    });

    it('should remove multiple fields', () => {
      const data = { id: '1', name: 'Test', field1: 'v1', field2: 'v2' };
      const result = removeDuplicateFields(data, ['field1', 'field2']);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).not.toHaveProperty('field1');
      expect(result).not.toHaveProperty('field2');
    });
  });

  describe('normalizeTenant', () => {
    it('should normalize tenant data', () => {
      const tenant = {
        id: '1',
        firstName: ' John ',
        lastName: 'Doe',
        phone: '081-234-5678',
        email: 'JOHN@EXAMPLE.COM',
        idNumber: '123456789',
        createdAt: '2024-01-01',
      };

      const result = normalizeTenant(tenant);

      expect(result.firstName).toBe('John');
      expect(result.email).toBe('john@example.com');
      expect(result.phone).toMatch(/\d{10}/);
    });

    it('should remove computed fields', () => {
      const tenant = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
        displayName: 'John D.',
      };

      const result = normalizeTenant(tenant);

      expect(result).not.toHaveProperty('fullName');
      expect(result).not.toHaveProperty('displayName');
    });
  });

  describe('normalizeInvoice', () => {
    it('should normalize invoice data', () => {
      const invoice = {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        roomId: 'room-1',
        tenantId: 'tenant-1',
        periodMonth: 1,
        periodYear: 2024,
        totalAmount: 5000.00,
        status: 'GENERATED',
        dueDate: '2024-02-15',
        sentAt: '2024-01-15',
        createdAt: new Date().toISOString(),
      };

      const result = normalizeInvoice(invoice);

      expect(result.totalAmount).toBe(500000);
      expect(result.status).toBe('GENERATED');
      expect(result).not.toHaveProperty('paidStatus');
    });
  });

  describe('normalizeContract', () => {
    it('should normalize contract data', () => {
      const contract = {
        id: 'contract-1',
        roomId: 'room-1',
        tenantId: 'tenant-1',
        startDate: '2024-01-01',
        endDate: '2025-01-01',
        monthlyRent: 5000.00,
        deposit: 10000.00,
        status: 'ACTIVE',
        isActive: true,
        daysRemaining: 365,
      };

      const result = normalizeContract(contract);

      expect(result.monthlyRent).toBe(500000);
      expect(result.deposit).toBe(1000000);
      expect(result).not.toHaveProperty('isActive');
      expect(result).not.toHaveProperty('daysRemaining');
    });
  });

  describe('normalizePayment', () => {
    it('should normalize payment data', () => {
      const payment = {
        id: 'pay-1',
        bankAccountId: 'bank-1',
        amount: 5000.00,
        reference: '  TRF20240115001  ',
        transferDate: '2024-01-15',
        status: 'PENDING',
      };

      const result = normalizePayment(payment);

      expect(result.amount).toBe(500000);
      expect(result.reference).toBe('TRF20240115001');
      expect(result.status).toBe('PENDING');
    });
  });

  describe('normalizeRoom', () => {
    it('should normalize room data', () => {
      const room = {
        id: 'room-1',
        roomNumber: ' 101 ',
        floorId: 'floor-1',
        rentableArea: 30.5,
        type: 'Standard',
        maxOccupants: 2,
        activeContractsCount: 1,
        maintenanceMode: false,
      };

      const result = normalizeRoom(room);

      expect(result.roomNumber).toBe('101');
      expect(result.status).toBe('OCCUPIED');
      expect(result).not.toHaveProperty('activeContractsCount');
      expect(result).not.toHaveProperty('maintenanceMode');
    });

    it('should detect maintenance status', () => {
      const room = {
        id: 'room-1',
        roomNumber: '101',
        floorId: 'floor-1',
        activeContractsCount: 0,
        maintenanceMode: true,
      };

      const result = normalizeRoom(room);

      expect(result.status).toBe('MAINTENANCE');
    });
  });
});
