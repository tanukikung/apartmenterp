import React, { useRef, useState } from 'react';

export type QuickReply = {
  label: string;
  icon?: string;
  action: string;
};

type Props = {
  disabled?: boolean;
  onSendText: (text: string) => Promise<boolean>;
  onUploadFile?: (file: File) => Promise<void>;
  templates?: Array<{ id: string; label: string; text: string }>;
  uploadProgress?: number | null;
  onRetryUpload?: (() => void) | null;
  failedUploadName?: string | null;
  quickReplies?: QuickReply[];
  onQuickReply?: (action: string) => void;
};

export function ChatComposer({
  disabled,
  onSendText,
  onUploadFile,
  templates = [],
  uploadProgress = null,
  onRetryUpload = null,
  failedUploadName = null,
  quickReplies = [],
  onQuickReply,
}: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const sent = await onSendText(text);
      if (sent) {
        setText('');
        setSelectedTemplateId('');
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
    <div className="space-y-3 border-t border-line-green/20 pt-4">
      {/* Quick reply chips — LINE OA style */}
      {quickReplies.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {quickReplies.map((qr, i) => (
            <button
              key={i}
              onClick={() => onQuickReply?.(qr.action)}
              className="shrink-0 px-3 py-1.5 rounded-full border border-line-green/30 bg-line-green-light text-sm font-medium text-line-green-dark whitespace-nowrap transition-colors hover:bg-line-green/20 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={disabled || !onQuickReply}
            >
              {qr.icon && <span className="mr-1">{qr.icon}</span>}
              {qr.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          className="admin-textarea flex-1"
          placeholder="พิมพ์ข้อความ..."
          value={text}
          onChange={(e) => { setText(e.target.value); setSelectedTemplateId(''); }}
          disabled={disabled || busy}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="admin-select max-w-[180px]"
          value={selectedTemplateId}
          onChange={(e) => {
            setSelectedTemplateId(e.target.value);
            const template = templates.find((item) => item.id === e.target.value);
            if (template) setText(template.text);
          }}
          disabled={disabled || busy || templates.length === 0}
        >
          <option value="">เทมเพลต</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>{template.label}</option>
          ))}
        </select>
        <input ref={fileRef} onChange={upload} type="file" className="hidden" />
        <button onClick={() => fileRef.current?.click()} disabled={disabled || busy || !onUploadFile} className="admin-button">
          อัปโหลด
        </button>
        {uploadProgress != null ? (
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-line-green-light">
              <div className="h-full bg-line-green" style={{ width: `${Math.max(0, Math.min(100, Math.floor(uploadProgress)))}%` }} />
            </div>
            <div className="text-xs text-slate-600">{`${Math.floor(uploadProgress)}%`}</div>
          </div>
        ) : failedUploadName && onRetryUpload ? (
          <div className="flex items-center gap-2">
            <div className="text-xs text-on-error-container">อัปโหลดไม่สำเร็จ: {failedUploadName}</div>
            <button onClick={onRetryUpload} disabled={disabled || busy} className="admin-button">
              ลองอีกครั้ง
            </button>
          </div>
        ) : null}
        <button onClick={send} disabled={disabled || busy || !text.trim()} className="admin-button admin-button-primary">
          ส่ง
        </button>
      </div>
    </div>
  );
}
