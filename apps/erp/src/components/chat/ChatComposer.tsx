import React, { useRef, useState } from 'react';

type Props = {
  disabled?: boolean;
  onSendText: (text: string) => Promise<boolean>;
  onUploadFile?: (file: File) => Promise<void>;
  templates?: Array<{ id: string; label: string; text: string }>;
  uploadProgress?: number | null;
  onRetryUpload?: (() => void) | null;
  failedUploadName?: string | null;
};

export function ChatComposer({
  disabled,
  onSendText,
  onUploadFile,
  templates = [],
  uploadProgress = null,
  onRetryUpload = null,
  failedUploadName = null,
}: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const sent = await onSendText(text);
      if (sent) {
        setText('');
      }
    } finally {
      setBusy(false);
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onUploadFile) return;
    setBusy(true);
    try {
      await onUploadFile(file);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-3 border-t border-pink-100 pt-4">
      <div className="flex gap-2">
        <textarea
          className="admin-textarea flex-1"
          placeholder="Type something friendly"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled || busy}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="admin-select max-w-[180px]"
          value=""
          onChange={(e) => {
            const template = templates.find((item) => item.id === e.target.value);
            if (template) setText(template.text);
          }}
          disabled={disabled || busy || templates.length === 0}
        >
          <option value="" disabled>Templates</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>{template.label}</option>
          ))}
        </select>
        <input ref={fileRef} onChange={upload} type="file" className="hidden" />
        <button onClick={() => fileRef.current?.click()} disabled={disabled || busy || !onUploadFile} className="admin-button">
          Upload
        </button>
        {uploadProgress != null ? (
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-pink-100">
              <div className="h-full bg-gradient-to-r from-pink-400 to-violet-500" style={{ width: `${Math.max(0, Math.min(100, Math.floor(uploadProgress)))}%` }} />
            </div>
            <div className="text-xs text-slate-600">{`${Math.floor(uploadProgress)}%`}</div>
          </div>
        ) : failedUploadName && onRetryUpload ? (
          <div className="flex items-center gap-2">
            <div className="text-xs text-red-600">Upload failed: {failedUploadName}</div>
            <button onClick={onRetryUpload} disabled={disabled || busy} className="admin-button">
              Retry
            </button>
          </div>
        ) : null}
        <button onClick={send} disabled={disabled || busy || !text.trim()} className="admin-button admin-button-primary">
          Send
        </button>
      </div>
    </div>
  );
}
