'use client';

import { useEffect, useState } from 'react';

type OnlyOfficeHealthResponse = {
  success: boolean;
  data?: {
    enabled: boolean;
    configured: boolean;
    connected: boolean;
    error?: string;
  };
};

type OnlyOfficeFrameProps = {
  configUrl: string;
  className?: string;
};

type Status = 'idle' | 'checking' | 'ready' | 'error' | 'disabled';

const STATUS_LABELS: Record<Status, string> = {
  idle:     'Waiting...',
  checking: 'Checking connection...',
  ready:    'Connected',
  error:    'Connection failed',
  disabled: 'Editor disabled',
};

const STATUS_COLORS: Record<Status, string> = {
  idle:     'bg-slate-100 text-slate-500',
  checking: 'bg-blue-50 text-blue-600',
  ready:    'bg-emerald-50 text-emerald-700',
  error:    'bg-red-50 text-red-600',
  disabled: 'bg-amber-50 text-amber-700',
};

/**
 * OnlyOfficeFrame
 *
 * Renders ONLYOFFICE inside a same-origin <iframe> served by
 * /api/onlyoffice/frame — so ONLYOFFICE's DOM manipulation is completely
 * isolated from React's reconciler.
 *
 * Critical: the shell div NEVER has conditional children.  All nodes
 * (iframe + 3 overlays) are always in the DOM; only className / src
 * attributes change.  This prevents React from ever calling insertBefore /
 * removeChild inside the shell, which previously caused the
 * "insertBefore: node is not a child" crash.
 */
export function OnlyOfficeFrame({ configUrl, className }: OnlyOfficeFrameProps) {
  const [status,      setStatus]      = useState<Status>('idle');
  const [errorMsg,    setErrorMsg]    = useState('');
  const [disabledMsg, setDisabledMsg] = useState('');
  const [frameSrc,    setFrameSrc]    = useState('about:blank');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      setStatus('checking');
      setErrorMsg('');
      setDisabledMsg('');
      setFrameSrc('about:blank');

      try {
        const res  = await fetch('/api/health/onlyoffice', { cache: 'no-store' });
        const body = (await res.json()) as OnlyOfficeHealthResponse;
        const h    = body.data;

        if (!body.success || !h) {
          if (!cancelled) { setStatus('error'); setErrorMsg('Unable to check editor status'); }
          return;
        }
        if (!h.enabled) {
          if (!cancelled) { setStatus('disabled'); setDisabledMsg('ONLYOFFICE is disabled. Set ONLYOFFICE_ENABLED=true.'); }
          return;
        }
        if (!h.configured) {
          if (!cancelled) { setStatus('disabled'); setDisabledMsg('ONLYOFFICE is not configured. Set ONLYOFFICE_DOCUMENT_SERVER_URL and ONLYOFFICE_JWT_SECRET.'); }
          return;
        }
        if (!h.connected) {
          if (!cancelled) { setStatus('error'); setErrorMsg(h.error ? `Document server unreachable: ${h.error}` : 'Document server is not responding.'); }
          return;
        }
      } catch {
        if (!cancelled) { setStatus('error'); setErrorMsg('Cannot reach health check endpoint.'); }
        return;
      }

      if (!cancelled) {
        setFrameSrc(`/api/onlyoffice/frame?configUrl=${encodeURIComponent(configUrl)}`);
        setStatus('ready');
      }
    }

    void check();
    return () => { cancelled = true; };
  }, [configUrl]);

  const isLoading  = status === 'idle' || status === 'checking';
  const isError    = status === 'error';
  const isDisabled = status === 'disabled';
  const isReady    = status === 'ready';

  return (
    <div className={className}>

      {/* Status bar — outside shell, safe for React to update freely */}
      <div className="mb-2 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            status === 'ready'    ? 'bg-emerald-500' :
            status === 'error'    ? 'bg-red-500'     :
            status === 'disabled' ? 'bg-amber-500'   : 'bg-blue-500'
          }`} />
          {STATUS_LABELS[status]}
        </span>
        {(isError || isDisabled) && (
          <button type="button"
            onClick={() => { setStatus('idle'); }}
            className="text-xs font-medium text-primary hover:text-primary/80 underline">
            Retry
          </button>
        )}
      </div>

      {/*
        Shell — 720 px fixed height.

        RULE: every child node is ALWAYS in the DOM.
              Only className / src attributes change.
              React never calls insertBefore or removeChild here.

        Children (all always-mounted):
          1. <iframe>  — src="about:blank" until ready, then boot URL
          2. loading overlay — hidden class when not loading
          3. error overlay   — hidden class when no error
          4. disabled overlay — hidden class when not disabled
      */}
      <div className="relative h-[720px] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">

        {/* 1. ONLYOFFICE iframe — always in DOM, src toggles.
             sandbox WITHOUT allow-same-origin: prevents ONLYOFFICE's api.js
             from using window.parent.document to manipulate the React host DOM,
             which caused insertBefore crashes when switching versions. */}
        <iframe
          src={frameSrc}
          className={`absolute inset-0 h-full w-full border-0${isReady ? '' : ' invisible'}`}
          title="ONLYOFFICE Editor"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-scripts allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox"
        />

        {/* 2. Loading overlay — always in DOM */}
        <div className={`absolute inset-0 flex items-center justify-center bg-white${isLoading ? '' : ' hidden'}`}>
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
            <p className="text-sm text-slate-500">Checking editor connection...</p>
          </div>
        </div>

        {/* 3. Error overlay — always in DOM */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center border border-red-200 bg-red-50 p-8 text-center${isError ? '' : ' hidden'}`}>
          <div className="mb-4 text-4xl">⚠️</div>
          <h3 className="mb-2 text-base font-semibold text-red-800">Cannot connect to ONLYOFFICE</h3>
          <p className="mb-6 max-w-md text-sm text-red-600">{errorMsg}</p>
          <div className="rounded-xl border border-red-200 bg-white p-4 text-left text-xs text-slate-600">
            <p className="mb-2 font-semibold">Quick checks:</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>ONLYOFFICE running? <code className="bg-red-100 px-1">docker compose up -d onlyoffice</code></li>
              <li><code className="bg-red-100 px-1">ONLYOFFICE_DOCUMENT_SERVER_URL</code> correct?</li>
              <li>Callback: <code className="bg-red-100 px-1">http://host.docker.internal:3001</code></li>
            </ol>
          </div>
          <button type="button" onClick={() => setStatus('idle')}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Try again
          </button>
        </div>

        {/* 4. Disabled overlay — always in DOM */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center border border-amber-200 bg-amber-50 p-8 text-center${isDisabled ? '' : ' hidden'}`}>
          <div className="mb-4 text-4xl">🔒</div>
          <h3 className="mb-2 text-base font-semibold text-amber-800">ONLYOFFICE Editor Disabled</h3>
          <p className="mb-4 max-w-md text-sm text-amber-700">{disabledMsg}</p>
          <p className="text-xs text-amber-600">You can still upload HTML files using the Upload button.</p>
        </div>

      </div>
    </div>
  );
}
