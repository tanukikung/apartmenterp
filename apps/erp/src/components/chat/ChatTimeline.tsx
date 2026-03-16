import React from 'react';
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
  onRetry?: (message: Message) => void;
  onSendFile?: (message: Message) => void;
  canSendViaLine?: boolean;
  onConfirmSlip?: (slip: { id: string; amount: number; date?: string | null; imageUrl?: string | null }) => void;
};

function ChatTimelineImpl({ messages, onRetry, onSendFile, canSendViaLine, onConfirmSlip }: Props) {
  function renderCard(message: Message) {
    if (message.type === 'INVOICE') {
      const data = JSON.parse(message.content) as { invoiceId: string; amount: number; dueDate?: string; status?: string };
      return <InvoiceCard invoiceId={data.invoiceId} amount={data.amount} dueDate={data.dueDate ?? null} status={data.status ?? null} />;
    }
    if (message.type === 'RECEIPT') {
      const data = JSON.parse(message.content) as { receiptId: string; amount: number; issuedAt?: string };
      return <ReceiptCard receiptId={data.receiptId} amount={data.amount} issuedAt={data.issuedAt ?? null} />;
    }
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
      return <div className="text-sm">{message.content}</div>;
    }

    return <div className="text-sm">{message.content}</div>;
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
        return (
          <div
            key={message.id}
            className={`max-w-[78%] rounded-[1.5rem] border p-3 shadow-sm transition ${
              outgoing
                ? 'ml-auto border-pink-300 bg-gradient-to-br from-pink-500 via-rose-500 to-fuchsia-500 text-white'
                : 'border-pink-100 bg-white text-slate-800'
            }`}
          >
            {renderCard(message)}
            <div className={`mt-2 text-[10px] ${outgoing ? 'text-pink-100' : 'text-slate-500'}`}>
              {new Date(message.sentAt).toLocaleString()}
              {status ? ` · ${status}` : null}
            </div>
            {status === 'failed' && onRetry ? (
              <div className="mt-1">
                <button onClick={() => onRetry(message)} className={`text-[11px] underline ${outgoing ? 'text-pink-100' : 'text-slate-600'}`}>
                  Retry
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
      {!messages.length ? <div className="p-4 text-sm text-slate-500">No messages in this conversation.</div> : null}
    </div>
  );
}

export const ChatTimeline = React.memo(ChatTimelineImpl);
