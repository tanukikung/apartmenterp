import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { daysSince } from '@/app/admin/overdue/date-utils';

describe('Overdue room detail runtime date behavior', () => {
  it('computes overdue days from the current runtime date', () => {
    const now = new Date('2026-03-17T12:00:00Z');

    expect(daysSince('2026-03-15T00:00:00Z', now)).toBe(2);
    expect(daysSince('2026-03-17T12:00:00Z', now)).toBe(0);
  });

  it('clamps future due dates to zero overdue days', () => {
    const now = new Date('2026-03-17T12:00:00Z');

    expect(daysSince('2026-03-18T00:00:00Z', now)).toBe(0);
  });

  it('does not keep a frozen date constant in the overdue room detail page', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/admin/overdue/[roomId]/page.tsx'),
      'utf8',
    );

    expect(pageSource).toContain('daysSince(');
    expect(pageSource).not.toContain("new Date('2026-03-16')");
  });
});
