import { NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { clearAuthCookies } from '@/lib/auth/session';
import { formatSuccess } from '@/lib/api-response';

export const POST = asyncHandler(async (): Promise<NextResponse> => {
  const res = NextResponse.json(formatSuccess(null));
  clearAuthCookies(res);
  return res;
});
