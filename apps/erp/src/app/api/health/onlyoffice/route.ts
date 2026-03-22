import { NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { isOnlyOfficeEnabled } from '@/lib/onlyoffice';

async function checkOnlyOfficeConnection(): Promise<{
  connected: boolean;
  version?: string;
  error?: string;
}> {
  const url = (process.env.ONLYOFFICE_DOCUMENT_SERVER_URL || '').trim();

  if (!url) {
    return {
      connected: false,
      error: 'ONLYOFFICE_DOCUMENT_SERVER_URL is not configured',
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${url.replace(/\/+$/, '')}/healthcheck`, {
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timer);

    if (res.ok) {
      // Try to get version info
      let version: string | undefined;
      try {
        const versionRes = await fetch(`${url.replace(/\/+$/, '')}/version`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (versionRes.ok) {
          const versionData = await versionRes.json();
          version = versionData.version || versionData;
        }
      } catch {
        // Version check is optional
      }

      return {
        connected: true,
        version,
      };
    } else {
      return {
        connected: false,
        error: `Health check returned status ${res.status}`,
      };
    }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  const enabled = isOnlyOfficeEnabled();
  const configured = Boolean(process.env.ONLYOFFICE_DOCUMENT_SERVER_URL?.trim());
  const result = await checkOnlyOfficeConnection();

  const data = {
    ...result,
    enabled,        // whether the integration is enabled via env var
    configured,    // whether URL is set
    usable: enabled && configured && result.connected, // full end-to-end usable
    url: process.env.ONLYOFFICE_DOCUMENT_SERVER_URL || null,
  };

  return NextResponse.json({
    success: true,
    data,
  } as ApiResponse<typeof data>);
});
