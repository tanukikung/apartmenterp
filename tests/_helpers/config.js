// Shared E2E configuration — import from helpers and test files
export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3001';
export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:anand37048@localhost:5432/test';