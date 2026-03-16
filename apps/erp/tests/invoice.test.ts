import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('invoice lifecycle field', () => {
  it('schema contains issuedAt field on Invoice model', () => {
    const schemaPath = join(__dirname, '..', 'prisma', 'schema.prisma');
    const contents = readFileSync(schemaPath, 'utf8');
    const invoiceModelBlock = contents
      .split('model Invoice')[1]
      ?.split('}')[0] || '';
    expect(invoiceModelBlock).toContain('issuedAt');
  });
});
