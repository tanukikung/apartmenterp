import { describe, it, expect } from 'vitest';
import { assignTenantSchema } from '@/modules/tenants/types';

describe('tenant assignment schema', () => {
  it('parses valid assignment', () => {
    const parsed = assignTenantSchema.safeParse({
      tenantId: '11111111-1111-1111-1111-111111111111',
      role: 'PRIMARY',
      moveInDate: '2025-01-15',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const parsed = assignTenantSchema.safeParse({
      tenantId: '11111111-1111-1111-1111-111111111111',
      role: 'OWNER',
      moveInDate: '2025-01-15',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid date', () => {
    const parsed = assignTenantSchema.safeParse({
      tenantId: '11111111-1111-1111-1111-111111111111',
      role: 'SECONDARY',
      moveInDate: 'not-a-date',
    });
    expect(parsed.success).toBe(false);
  });
});
