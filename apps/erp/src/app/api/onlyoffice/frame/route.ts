import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { UnauthorizedError, asyncHandler } from '@/lib/utils/errors';

/**
 * GET /api/onlyoffice/frame?configUrl=<encoded-url>
 *
 * Serves a self-contained HTML page that boots ONLYOFFICE inside an iframe.
 * This page is meant to be embedded as an <iframe src="..."> in the admin UI.
 * Running ONLYOFFICE in a separate document completely isolates its DOM
 * manipulation from React's reconciler — no insertBefore crashes.
 *
 * Auth: the session cookie is forwarded automatically (same-origin iframe),
 * so we validate the session here before serving the boot page.
 */
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = getSessionFromRequest(req);
  if (!session || !['ADMIN', 'STAFF'].includes(session.role)) {
    throw new UnauthorizedError('Authentication required');
  }

  const url = new URL(req.url);
  const configUrl = url.searchParams.get('configUrl');
  if (!configUrl) {
    return NextResponse.json({ error: 'Missing configUrl' }, { status: 400 });
  }

  // Fetch the editor config server-side (has session via cookie forwarding)
  const configRes = await fetch(new URL(configUrl, req.url).toString(), {
    headers: { cookie: req.headers.get('cookie') ?? '' },
    cache: 'no-store',
  });
  const configJson = await configRes.json() as {
    success: boolean;
    configured?: boolean;
    data?: {
      documentServerUrl: string;
      config: Record<string, unknown>;
      token?: string;
    };
    error?: { message?: string };
  };

  if (!configJson.success || !configJson.data) {
    const msg = configJson.error?.message ?? 'Failed to load editor config';
    const html = errorPage(msg);
    return new NextResponse(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const { documentServerUrl, config, token } = configJson.data;
  const editorConfig = token ? { ...config, token } : config;

  const html = bootPage(documentServerUrl, editorConfig);
  return new NextResponse(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // Allow embedding as iframe from same origin
      'x-frame-options': 'SAMEORIGIN',
    },
  });
});

function bootPage(documentServerUrl: string, config: Record<string, unknown>): string {
  const configJson = JSON.stringify(config);
  const apiScript = `${documentServerUrl}/web-apps/apps/api/documents/api.js`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #editor { height: 100%; width: 100%; overflow: hidden; }
    body { background: #fff; font-family: sans-serif; }
    #loading {
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; background: #fff; z-index: 100;
      gap: 12px; color: #64748b; font-size: 13px;
    }
    #loading .spinner {
      width: 32px; height: 32px; border: 4px solid #e2e8f0;
      border-top-color: #6366f1; border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
    <span>Loading ONLYOFFICE editor...</span>
  </div>
  <div id="editor"></div>
  <script>
    (function() {
      var config = ${configJson};
      var script = document.createElement('script');
      script.src = ${JSON.stringify(apiScript)};
      script.async = true;
      script.onload = function() {
        try {
          new window.DocsAPI.DocEditor('editor', config);
          var loading = document.getElementById('loading');
          if (loading) loading.style.display = 'none';
        } catch(e) {
          document.getElementById('loading').innerHTML =
            '<div style="color:#ef4444;padding:24px;text-align:center">' +
            '<div style="font-size:24px;margin-bottom:8px">⚠️</div>' +
            '<div style="font-weight:600">Failed to start editor</div>' +
            '<div style="font-size:12px;margin-top:4px;color:#94a3b8">' + e.message + '</div>' +
            '</div>';
        }
      };
      script.onerror = function() {
        document.getElementById('loading').innerHTML =
          '<div style="color:#ef4444;padding:24px;text-align:center">' +
          '<div style="font-size:24px;margin-bottom:8px">⚠️</div>' +
          '<div style="font-weight:600">Cannot load ONLYOFFICE API</div>' +
          '<div style="font-size:12px;margin-top:4px;color:#94a3b8">Check ONLYOFFICE_DOCUMENT_SERVER_URL</div>' +
          '</div>';
      };
      document.head.appendChild(script);
    })();
  </script>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;
font-family:sans-serif;background:#fef2f2;color:#991b1b;}
.box{text-align:center;padding:32px;}
</style></head><body>
<div class="box">
  <div style="font-size:32px;margin-bottom:12px">⚠️</div>
  <div style="font-weight:600;margin-bottom:4px">Editor config error</div>
  <div style="font-size:12px;color:#b91c1c">${message.replace(/</g, '&lt;')}</div>
</div>
</body></html>`;
}
