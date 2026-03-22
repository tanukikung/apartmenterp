'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

type OnlyOfficeHealthResponse = {
  success: boolean;
  data?: {
    enabled: boolean;
    configured: boolean;
    usable: boolean;
    connected: boolean;
    version?: string;
    error?: string;
    url: string | null;
  };
};

type OnlyOfficeConfigResponse = {
  success: boolean;
  configured?: boolean;
  error?: {
    message?: string;
    code?: string;
  };
  data?: {
    documentServerUrl: string;
    config: Record<string, unknown>;
    token?: string;
  };
};

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (elementId: string, config: Record<string, unknown>) => {
        destroyEditor?: () => void;
      };
    };
  }
}

type OnlyOfficeFrameProps = {
  configUrl: string;
  className?: string;
};

type Status = 'idle' | 'checking' | 'loading' | 'ready' | 'error' | 'disabled';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-onlyoffice-script="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load ONLYOFFICE API')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.onlyofficeScript = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error('Unable to load ONLYOFFICE API')));
    document.head.appendChild(script);
  });
}

const STATUS_LABELS: Record<Status, string> = {
  idle: 'Waiting...',
  checking: 'Checking connection...',
  loading: 'Loading ONLYOFFICE editor...',
  ready: 'Connected',
  error: 'Connection failed',
  disabled: 'Editor disabled',
};

const STATUS_COLORS: Record<Status, string> = {
  idle: 'bg-slate-100 text-slate-500',
  checking: 'bg-blue-50 text-blue-600',
  loading: 'bg-blue-50 text-blue-600',
  ready: 'bg-emerald-50 text-emerald-700',
  error: 'bg-red-50 text-red-600',
  disabled: 'bg-amber-50 text-amber-700',
};

export function OnlyOfficeFrame({ configUrl, className }: OnlyOfficeFrameProps) {
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const containerId = useId().replace(/:/g, '_');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [disabledMessage, setDisabledMessage] = useState<string | null>(null);

  const boot = useCallback(async () => {
    setStatus('checking');
    setErrorMessage(null);
    setDisabledMessage(null);

    // Step 1: Check health endpoint
    try {
      const healthRes = await fetch('/api/health/onlyoffice', { cache: 'no-store' });
      const healthJson = (await healthRes.json()) as OnlyOfficeHealthResponse;
      const health = healthJson.data;

      if (!healthJson.success || !health) {
        setStatus('error');
        setErrorMessage('Unable to check editor status');
        return;
      }

      if (!health.enabled) {
        setStatus('disabled');
        setDisabledMessage('ONLYOFFICE is disabled. Set ONLYOFFICE_ENABLED=true to enable it.');
        return;
      }

      if (!health.configured) {
        setStatus('disabled');
        setDisabledMessage('ONLYOFFICE is not configured. Set ONLYOFFICE_DOCUMENT_SERVER_URL and ONLYOFFICE_JWT_SECRET in your environment.');
        return;
      }

      if (!health.connected) {
        setStatus('error');
        setErrorMessage(
          health.error
            ? `Document server unreachable: ${health.error}`
            : 'Document server is not responding. Check ONLYOFFICE_DOCUMENT_SERVER_URL and ensure the server is running.',
        );
        return;
      }
    } catch {
      setStatus('error');
      setErrorMessage('Cannot reach health check endpoint. Is the app server running?');
      return;
    }

    // Step 2: Get editor config
    setStatus('loading');
    try {
      const response = await fetch(configUrl, { cache: 'no-store' });
      const json = (await response.json()) as OnlyOfficeConfigResponse;

      if (!response.ok || !json.success) {
        if (json.configured === false) {
          setStatus('disabled');
          setDisabledMessage(
            json.error?.message
              ? `ONLYOFFICE not configured: ${json.error.message}`
              : 'ONLYOFFICE is not enabled. Set ONLYOFFICE_ENABLED=true.',
          );
          return;
        }
        throw new Error(json.error?.message ?? 'Unable to load ONLYOFFICE config');
      }

      if (!json.data) {
        throw new Error('No editor data returned');
      }

      // Step 3: Load ONLYOFFICE script
      await loadScript(`${json.data.documentServerUrl}/web-apps/apps/api/documents/api.js`);
      if (!window.DocsAPI?.DocEditor) {
        throw new Error('ONLYOFFICE API failed to load');
      }

      if (editorRef.current?.destroyEditor) {
        editorRef.current.destroyEditor();
        editorRef.current = null;
      }

      // Step 4: Boot editor
      const config = json.data.token
        ? { ...json.data.config, token: json.data.token }
        : json.data.config;

      editorRef.current = new window.DocsAPI.DocEditor(containerId, config);
      setStatus('ready');
    } catch (nextError) {
      setStatus('error');
      setErrorMessage(nextError instanceof Error ? nextError.message : 'Unable to start ONLYOFFICE');
    }
  }, [configUrl, containerId]);

  useEffect(() => {
    void boot();

    return () => {
      if (editorRef.current?.destroyEditor) {
        editorRef.current.destroyEditor();
        editorRef.current = null;
      }
    };
  }, [boot]);

  const showEditor = status === 'ready';

  return (
    <div className={className}>
      {/* Status bar */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[status]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              status === 'ready' ? 'bg-emerald-500' :
              status === 'error' ? 'bg-red-500' :
              status === 'disabled' ? 'bg-amber-500' :
              'bg-blue-500'
            }`} />
            {STATUS_LABELS[status]}
          </span>
        </div>
        {(status === 'error' || status === 'disabled') && (
          <button
            type="button"
            onClick={() => void boot()}
            className="text-xs font-medium text-primary hover:text-primary/80 underline"
          >
            Retry
          </button>
        )}
      </div>

      {/* Error / disabled state */}
      {status === 'error' && errorMessage ? (
        <div className="flex min-h-[640px] flex-col items-center justify-center rounded-[2rem] border border-red-200 bg-red-50 p-8 text-center">
          <div className="mb-4 text-4xl">⚠️</div>
          <h3 className="mb-2 text-base font-semibold text-red-800">Cannot connect to ONLYOFFICE</h3>
          <p className="mb-6 max-w-md text-sm text-red-600">{errorMessage}</p>
          <div className="rounded-xl border border-red-200 bg-white p-4 text-left text-xs text-slate-600">
            <p className="mb-2 font-semibold">Quick checks:</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>Is ONLYOFFICE running? (Docker: <code className="bg-red-100 px-1">docker compose up -d onlyoffice</code>)</li>
              <li>Is <code className="bg-red-100 px-1">ONLYOFFICE_DOCUMENT_SERVER_URL</code> correct?</li>
              <li>For Docker: is <code className="bg-red-100 px-1">ONLYOFFICE_CALLBACK_BASE_URL</code> set to <code className="bg-red-100 px-1">http://app:3000</code>?</li>
            </ol>
          </div>
          <button
            type="button"
            onClick={() => void boot()}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      ) : null}

      {status === 'disabled' && disabledMessage ? (
        <div className="flex min-h-[640px] flex-col items-center justify-center rounded-[2rem] border border-amber-200 bg-amber-50 p-8 text-center">
          <div className="mb-4 text-4xl">🔒</div>
          <h3 className="mb-2 text-base font-semibold text-amber-800">ONLYOFFICE Editor Disabled</h3>
          <p className="mb-4 max-w-md text-sm text-amber-700">{disabledMessage}</p>
          <p className="text-xs text-amber-600">
            You can still upload HTML template files directly using the Upload button on the Versions panel.
          </p>
        </div>
      ) : null}

      {/* Loading state */}
      {status === 'checking' || status === 'loading' || status === 'idle' ? (
        <div className="flex min-h-[640px] items-center justify-center rounded-[2rem] border border-slate-200 bg-white">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-primary" />
            <p className="text-sm text-slate-500">
              {status === 'checking' ? 'Checking editor connection...' : 'Loading ONLYOFFICE editor...'}
            </p>
          </div>
        </div>
      ) : null}

      {/* Editor container */}
      <div
        id={containerId}
        className={`${showEditor ? 'block' : 'hidden'} min-h-[720px] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm`}
      />
    </div>
  );
}
