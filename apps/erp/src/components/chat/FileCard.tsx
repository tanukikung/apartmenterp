import React from 'react';
import Image from 'next/image';

type Props = {
  id: string;
  name: string;
  contentType?: string | null;
  previewUrl?: string | null;
  onOpen?: () => void;
  onDownload?: () => void;
  onSend?: () => void;
  disabledSendReason?: string | null;
};

export function FileCard({ id, name, contentType, previewUrl, onOpen, onDownload, onSend, disabledSendReason }: Props) {
  const lowerUrl = (previewUrl || '').toLowerCase();
  const isImageByType = contentType?.startsWith('image/');
  const isImageByExt = /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lowerUrl);
  const isImage = isImageByType || isImageByExt;
  const isPdf = contentType === 'application/pdf' || lowerUrl.endsWith('.pdf');

  return (
    <div className="rounded-[1.6rem] border border-pink-100 bg-white p-3 shadow-sm">
      <div className="font-medium text-slate-900">File</div>
      <div className="mt-1 text-sm text-slate-600">ID: {id}</div>
      <div className="break-all text-sm text-slate-600">{name}</div>
      <div className="text-xs text-slate-500">{contentType || 'unknown'}</div>
      {previewUrl && (isImage || isPdf) ? (
        <div className="mt-2">
          {isImage ? (
            <div className="relative h-40 w-full max-w-xs overflow-hidden rounded-[1.35rem] border border-pink-100 bg-pink-50/50">
              <Image src={previewUrl} alt={name} fill sizes="200px" style={{ objectFit: 'contain' }} priority={false} />
            </div>
          ) : null}
          {isPdf ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-slate-600">PDF ready</span>
              <a href={previewUrl} target="_blank" rel="noreferrer" className="admin-button">Preview</a>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={onOpen} className="admin-button">Open</button>
        <button onClick={onDownload} className="admin-button">Download</button>
        <button onClick={onSend} disabled={Boolean(disabledSendReason)} title={disabledSendReason || undefined} className="admin-button admin-button-primary disabled:opacity-50">
          Send via LINE
        </button>
      </div>
    </div>
  );
}
