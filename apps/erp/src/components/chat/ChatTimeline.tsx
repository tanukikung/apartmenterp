import React, { useEffect, useRef } from 'react';
import { InvoiceCard } from './InvoiceCard';
import { ReceiptCard } from './ReceiptCard';
import { PaymentSlipCard } from './PaymentSlipCard';
import { FileCard } from './FileCard';

type Message = {
  id: string;
  direction: 'INCOMING' | 'OUTGOING';
  type: string;
  content: string;
  sentAt: string;
  metadata?: Record<string, unknown> | null;
  localStatus?: 'sending' | 'queued' | 'sent' | 'failed';
};

type Props = {
  messages: Message[];
  senderPictureUrl?: string | null;
  senderName?: string;
  onRetry?: (message: Message) => void;
  onSendFile?: (message: Message) => void;
  canSendViaLine?: boolean;
  onConfirmSlip?: (slip: { id: string; amount: number; date?: string | null; imageUrl?: string | null }) => void;
};

function StickerBubble({ stickerId, packageId }: { stickerId: string; packageId: string }) {
  const [error, setError] = React.useState(false);
  const url = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`;
  if (error) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
        Sticker
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`Sticker ${packageId}/${stickerId}`}
      onError={() => setError(true)}
      className="h-20 w-20 object-contain"
    />
  );
}

function IncomingAvatar({ src, name }: { src?: string | null; name?: string }) {
  const [error, setError] = React.useState(false);
  const displayName = name || '?';
  if (src && !error) {
    return (
      <img
        src={src}
        alt={displayName}
        onError={() => setError(true)}
        className="h-7 w-7 shrink-0 rounded-full object-cover border border-pink-100 self-end"
      />
    );
  }
  return (
    <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-pink-400 to-fuchsia-400 flex items-center justify-center text-white text-[10px] font-bold self-end">
      {displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function ChatTimelineImpl({ messages, senderPictureUrl, senderName, onRetry, onSendFile, canSendViaLine, onConfirmSlip }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function renderContent(message: Message) {
    // Sticker
    if (message.type === 'STICKER') {
      const stickerId = String(message.metadata?.stickerId || '');
      const packageId = String(message.metadata?.packageId || '');
      if (stickerId) return <StickerBubble stickerId={stickerId} packageId={packageId} />;
      return <div className="text-sm">[Sticker]</div>;
    }

    // Image
    if (message.type === 'IMAGE') {
      return (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-2xl">🖼️</span>
          <span className="opacity-80">รูปภาพจาก LINE</span>
        </div>
      );
    }

    // Invoice card
    if (message.type === 'INVOICE') {
      const data = JSON.parse(message.content) as { invoiceId: string; amount: number; dueDate?: string; status?: string };
      return <InvoiceCard invoiceId={data.invoiceId} amount={data.amount} dueDate={data.dueDate ?? null} status={data.status ?? null} />;
    }

    // Receipt card
    if (message.type === 'RECEIPT') {
      const data = JSON.parse(message.content) as { receiptId: string; amount: number; issuedAt?: string };
      return <ReceiptCard receiptId={data.receiptId} amount={data.amount} issuedAt={data.issuedAt ?? null} />;
    }

    // Payment slip
    if (message.type === 'PAYMENT_SLIP') {
      const data = JSON.parse(message.content) as { id: string; amount: number; date?: string; imageUrl?: string };
      return (
        <PaymentSlipCard
          id={data.id}
          amount={data.amount}
          date={data.date ?? null}
          imageUrl={data.imageUrl ?? null}
          onOpen={data.imageUrl ? () => window.open(data.imageUrl, '_blank', 'noopener,noreferrer') : undefined}
          onConfirm={onConfirmSlip ? () => onConfirmSlip({ id: data.id, amount: data.amount, date: data.date ?? null, imageUrl: data.imageUrl ?? null }) : undefined}
        />
      );
    }

    // File card (try to parse as JSON)
    try {
      const obj = JSON.parse(message.content) as { id?: string; name?: string; contentType?: string; previewUrl?: string };
      if (obj && obj.id && obj.name) {
        return (
          <FileCard
            id={obj.id}
            name={obj.name}
            contentType={obj.contentType ?? null}
            previewUrl={obj.previewUrl ?? null}
            onOpen={obj.previewUrl ? () => window.open(obj.previewUrl, '_blank', 'noopener,noreferrer') : undefined}
            onDownload={obj.previewUrl ? () => window.open(obj.previewUrl, '_blank', 'noopener,noreferrer') : undefined}
            onSend={onSendFile ? () => onSendFile(message) : undefined}
            disabledSendReason={canSendViaLine === false ? 'Tenant not linked to LINE' : null}
          />
        );
      }
    } catch {
      // fall through
    }

    return <div className="text-sm whitespace-pre-wrap">{message.content}</div>;
  }

  return (
    <div className="mb-4 flex-1 space-y-3 overflow-auto rounded-[1.75rem] border border-pink-100 bg-white/70 p-4 shadow-sm">
      {messages.map((message) => {
        let metaStatus: string | undefined;
        if (message.metadata && typeof message.metadata === 'object' && 'status' in message.metadata) {
          const value = (message.metadata as Record<string, unknown>).status;
          if (typeof value === 'string') metaStatus = value.toLowerCase();
        }
        const status = message.localStatus || metaStatus;
        const outgoing = message.direction === 'OUTGOING';
        const isSticker = message.type === 'STICKER';

        return (
          <div key={message.id} className={`flex items-end gap-2 ${outgoing ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar for incoming messages */}
            {!outgoing && (
              <IncomingAvatar src={senderPictureUrl} name={senderName} />
            )}

            <div
              className={`max-w-[72%] ${isSticker ? 'bg-transparent border-0 shadow-none p-0' : `rounded-[1.5rem] border p-3 shadow-sm`} transition ${
                isSticker
                  ? ''
                  : outgoing
                  ? 'border-pink-300 bg-gradient-to-br from-pink-500 via-rose-500 to-fuchsia-500 text-white'
                  : 'border-pink-100 bg-white text-slate-800'
              }`}
            >
              {renderContent(message)}
              {!isSticker && (
                <div className={`mt-2 text-[10px] ${outgoing ? 'text-pink-100' : 'text-slate-500'}`}>
                  {new Date(message.sentAt).toLocaleString('th-TH')}
                  {status ? ` · ${status}` : null}
                </div>
              )}
              {status === 'failed' && onRetry ? (
                <div className="mt-1">
                  <button onClick={() => onRetry(message)} className={`text-[11px] underline ${outgoing ? 'text-pink-100' : 'text-slate-600'}`}>
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      {!messages.length ? <div className="p-4 text-sm text-slate-500">No messages in this conversation.</div> : null}
      <div ref={bottomRef} />
    </div>
  );
}

export const ChatTimeline = React.memo(ChatTimelineImpl);
