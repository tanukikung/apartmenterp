/**
 * Guard that blocks mutating API calls when the global kill-switch is active.
 *
 * Usage in route handlers:
 *   const blocked = await requireMutationsAllowed();
 *   if (blocked) return blocked;
 */

import { NextResponse } from 'next/server';
import { isSystemReadOnly } from '@/lib/system';

export async function requireMutationsAllowed(): Promise<NextResponse | null> {
  if (await isSystemReadOnly()) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'System is in read-only mode. Mutating operations are temporarily disabled.',
          code: 'SYSTEM_READ_ONLY',
          statusCode: 503,
        },
      },
      {
        status: 503,
        headers: {
          'Retry-After': '60',
          'X-System-Read-Only': 'true',
        },
      },
    );
  }
  return null;
}