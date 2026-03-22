import { describe, expect, it } from 'vitest';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
} from '@/lib/utils/errors';

describe('AppError hierarchy', () => {
  it('AppError has correct default properties', () => {
    const error = new AppError('Test error', 'TEST_CODE', 500);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
    expect(error.name).toBe('AppError');
  });

  it('AppError.toJSON includes all fields', () => {
    const error = new AppError('Test error', 'TEST_CODE', 500, { extra: 'data' });
    const json = error.toJSON();
    expect(json.name).toBe('AppError');
    expect(json.message).toBe('Test error');
    expect(json.code).toBe('TEST_CODE');
    expect(json.statusCode).toBe(500);
    expect((json as Record<string, unknown>).details).toEqual({ extra: 'data' });
  });

  it('AppError captures stack trace', () => {
    const error = new AppError('Test');
    expect(error.stack).toBeDefined();
  });
});

describe('BadRequestError', () => {
  it('has status 400', () => {
    const error = new BadRequestError('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toBe('Invalid input');
  });

  it('accepts optional details', () => {
    const error = new BadRequestError('Invalid', { field: 'email' });
    expect(error.details).toEqual({ field: 'email' });
  });
});

describe('NotFoundError', () => {
  it('has status 404', () => {
    const error = new NotFoundError('Room', '101');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Room with id 101 not found');
  });

  it('formats message without id', () => {
    const error = new NotFoundError('Room');
    expect(error.message).toBe('Room not found');
  });
});

describe('ConflictError', () => {
  it('has status 409', () => {
    const error = new ConflictError('Room already exists');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });
});

describe('UnauthorizedError', () => {
  it('has status 401', () => {
    const error = new UnauthorizedError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.message).toBe('Unauthorized');
  });

  it('accepts custom message', () => {
    const error = new UnauthorizedError('Token expired');
    expect(error.message).toBe('Token expired');
  });
});

describe('ForbiddenError', () => {
  it('has status 403', () => {
    const error = new ForbiddenError();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });
});

describe('ValidationError', () => {
  it('has status 422', () => {
    const error = new ValidationError('Invalid data');
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});

describe('RateLimitError', () => {
  it('has status 429', () => {
    const error = new RateLimitError();
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});

describe('DatabaseError', () => {
  it('has status 500', () => {
    const original = new Error('Connection failed');
    const error = new DatabaseError(original, { context: 'test' });
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('DATABASE_ERROR');
    expect(error.details).toEqual({
      originalError: 'Connection failed',
      context: 'test',
    });
  });
});

describe('ExternalServiceError', () => {
  it('has status 503', () => {
    const original = new Error('timeout');
    const error = new ExternalServiceError('LINE', original);
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(error.details).toEqual({
      service: 'LINE',
      originalError: 'timeout',
    });
  });
});
