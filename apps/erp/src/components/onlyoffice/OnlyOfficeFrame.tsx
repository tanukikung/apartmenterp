'use client';

import { useEffect, useId, useRef, useState } from 'react';

type OnlyOfficeConfigResponse = {
  success: boolean;
  data?: {
    documentServerUrl: string;
    config: Record<string, unknown>;
    token?: string;
  };
  error?: {
    message?: string;
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

export function OnlyOfficeFrame({ configUrl, className }: OnlyOfficeFrameProps) {
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const containerId = useId().replace(/:/g, '_');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(configUrl, { cache: 'no-store' });
        const json = (await response.json()) as OnlyOfficeConfigResponse;
        if (!response.ok || !json.success || !json.data) {
          throw new Error(json.error?.message ?? 'Unable to load ONLYOFFICE config');
        }

        await loadScript(`${json.data.documentServerUrl}/web-apps/apps/api/documents/api.js`);
        if (cancelled) return;
        if (!window.DocsAPI?.DocEditor) {
          throw new Error('ONLYOFFICE API is unavailable');
        }

        if (editorRef.current?.destroyEditor) {
          editorRef.current.destroyEditor();
          editorRef.current = null;
        }

        const config = json.data.token
          ? { ...json.data.config, token: json.data.token }
          : json.data.config;

        editorRef.current = new window.DocsAPI.DocEditor(containerId, config);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Unable to start ONLYOFFICE');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      if (editorRef.current?.destroyEditor) {
        editorRef.current.destroyEditor();
        editorRef.current = null;
      }
    };
  }, [configUrl, containerId]);

  return (
    <div className={className}>
      {loading ? (
        <div className="flex min-h-[720px] items-center justify-center rounded-[2rem] border border-slate-200 bg-white text-slate-500 shadow-sm">
          Loading ONLYOFFICE editor...
        </div>
      ) : null}
      {error ? (
        <div className="auth-alert auth-alert-error">{error}</div>
      ) : null}
      <div
        id={containerId}
        className={`${loading || error ? 'hidden' : 'block'} min-h-[720px] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm`}
      />
    </div>
  );
}
