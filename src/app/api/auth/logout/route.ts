import { NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { clearAuthCookies } from '@/lib/auth/session';

export const POST = asyncHandler(async (): Promise<NextResponse> => {
  const res = NextResponse.json({ success: true });
  clearAuthCookies(res);
  return res;
});
