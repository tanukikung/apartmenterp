/**
 * P2002 Type-Safe Detection Tests
 *
 * Verifies that unique constraint violations (P2002) are detected using
 * instanceof Prisma.PrismaClientKnownRequestError + err.code === 'P2002'
 * rather than string matching on error.message.
 *
 * Run: npx vitest run tests/unit/prisma-p2002-type-safe.test.ts
 */

import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { mapPrismaError } from '@/lib/errors/prismaErrorMapper';

describe('mapPrismaError — P2002 type-safe detection', () => {
  it('detects P2002 via instanceof + code check (not string match)', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: undefined,
    });
    const result = mapPrismaError(err);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(409);
    expect(result!.code).toBe('DUPLICATE_RECORD');
  });

  it('returns null for unhandled Prisma error codes', () => {
    // P2001 is "Record to update not found" — not handled by mapPrismaError
    const err = new Prisma.PrismaClientKnownRequestError('Record to update not found', {
      code: 'P2001',
      clientVersion: '5.0.0',
      meta: undefined,
    });
    expect(mapPrismaError(err)).toBeNull();
  });

  it('returns null for plain Error (not PrismaError)', () => {
    expect(mapPrismaError(new Error('Something went wrong'))).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(mapPrismaError(null)).toBeNull();
    expect(mapPrismaError(undefined)).toBeNull();
  });

  it('P2025 (record not found) maps to 404', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
      meta: undefined,
    });
    const result = mapPrismaError(err);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(404);
    expect(result!.code).toBe('NOT_FOUND');
  });

  it('P2003 (foreign key) maps to 400', () => {
    const err = new Prisma.PrismaClientKnownRequestError('Foreign key failed', {
      code: 'P2003',
      clientVersion: '5.0.0',
      meta: undefined,
    });
    const result = mapPrismaError(err);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(400);
    expect(result!.code).toBe('INVALID_REFERENCE');
  });
});
