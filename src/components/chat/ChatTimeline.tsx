import React, { useEffect, useRef, useMemo } from 'react';
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
  localStatus?: 'sending' | 'queued' | 'sent' | 'failed' | 'delivered' | 'read';
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

// ─── Date Separator ───────────────────────────────────────────────────────────
function DateSeparator({ date }: { date: Date }) {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const isToday = date.toDateString() === todayStr;
  const isYesterday = date.toDateString() === yesterdayStr;

  const label = isToday
    ? 'วันนี้'
    : isYesterday
    ? 'เมื่อวาน'
    : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="flex items-center gap-3 my-4" aria-label={`ข้อความวันที่ ${label}`}>
      <div className="flex-1 h-px bg-line-green/20" />
      <span className="text-[11px] text-slate-400 font-medium px-2 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-line-green/20" />
    </div>
  );
}

// ─── Status Icons ────────────────────────────────────────────────────────────
function StatusIcon({ status }: { status?: string }) {
  if (status === 'read') {
    return <span className="text-[10px] tracking-wide text-line-green font-bold">✓✓</span>;
  }
  if (status === 'delivered') {
    return <span className="text-[10px] tracking-wide text-slate-400">✓✓</span>;
  }
  if (status === 'sent') {
    return <span className="text-[10px] tracking-wide text-slate-400">✓</span>;
  }
  if (status === 'sending' || status === 'queued') {
    return <span className="text-[10px] text-slate-300 animate-pulse">○</span>;
  }
  return null;
}

// ─── Sticker Bubble ──────────────────────────────────────────────────────────
function StickerBubble({ stickerId, packageId }: { stickerId: string; packageId: string }) {
  const [error, setError] = React.useState(false);
  const url = `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`;
  if (error) {
    return (
      <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
        สติกเกอร์
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- LINE CDN sticker
    <img src={url} alt={`Sticker ${packageId}/${stickerId}`} onError={() => setError(true)} className="h-20 w-20 object-contain" />
  );
}

// ─── Incoming Avatar ─────────────────────────────────────────────────────────
function IncomingAvatar({ src, name }: { src?: string | null; name?: string }) {
  const [error, setError] = React.useState(false);
  const displayName = name || '?';
  if (src && !error) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- LINE CDN avatar
      <img
        src={src}
        alt={displayName}
        onError={() => setError(true)}
        className="h-7 w-7 shrink-0 rounded-full object-cover border-2 border-line-green/20 self-end"
      />
    );
  }
  return (
    <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-line-green to-emerald-500 flex items-center justify-center text-white text-[10px] font-bold self-end">
      {displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

// ─── Grouped Message ──────────────────────────────────────────────────────────
type GroupedMessage = {
  message: Message;
  showTimestamp: boolean;
};

function groupMessages(messages: Message[], timeWindowMs = 5 * 60 * 1000): GroupedMessage[] {
  const result: GroupedMessage[] = [];
  for (const msg of messages) {
    const last = result[result.length - 1];
    const prevMsg = last?.message;
    const gap =
      prevMsg &&
      prevMsg.direction === msg.direction &&
      new Date(msg.sentAt).getTime() - new Date(prevMsg.sentAt).getTime() <= timeWindowMs;
    result.push({ message: msg, showTimestamp: !gap || prevMsg.direction !== msg.direction });
  }
  return result;
}

// ─── Chat Timeline ───────────────────────────────────────────────────────────
function ChatTimelineImpl({ messages, senderPictureUrl, senderName, onRetry, onSendFile, canSendViaLine, onConfirmSlip }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Group messages for rendering
  const grouped = useMemo(() => groupMessages(messages), [messages]);

  function getStatus(msg: Message): string | undefined {
    if (msg.localStatus) return msg.localStatus;
    if (msg.metadata && typeof msg.metadata === 'object' && 'status' in msg.metadata) {
      const value = (msg.metadata as Record<string, unknown>).status;
      return typeof value === 'string' ? value.toLowerCase() : undefined;
    }
    return undefined;
  }

  function getDateKey(date: Date): string {
    return date.toDateString();
  }

  function renderContent(message: Message) {
    // Sticker
    if (message.type === 'STICKER') {
      const stickerId = String(message.metadata?.stickerId || '');
      const packageId = String(message.metadata?.packageId || '');
      if (stickerId) return <StickerBubble stickerId={stickerId} packageId={packageId} />;
      return <div className="text-sm">[สติกเกอร์]</div>;
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
      return <InvoiceCard invoiceId={data.invoiceId} amount={data.amount} dueDate={data.dueDate ?? null} status={data.status ?? null} lineConfigured={canSendViaLine ?? false} />;
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

    // File card
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
            disabledSendReason={canSendViaLine === false ? 'ผู้เช่ายังไม่ได้เชื่อมต่อ LINE' : null}
          />
        );
      }
    } catch {
      // fall through
    }

    return <div className="text-sm whitespace-pre-wrap">{message.content}</div>;
  }

  // Build render list with date separators
  const items: React.ReactNode[] = [];
  let lastDateKey: string | null = null;

  grouped.forEach(({ message: msg, showTimestamp }) => {
    const msgDate = new Date(msg.sentAt);
    const dateKey = getDateKey(msgDate);

    if (dateKey !== lastDateKey) {
      items.push(<DateSeparator key={`sep-${dateKey}`} date={msgDate} />);
      lastDateKey = dateKey;
    }

    const status = getStatus(msg);
    const outgoing = msg.direction === 'OUTGOING';
    const isSticker = msg.type === 'STICKER';
    const timeStr = msgDate.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    items.push(
      <div key={msg.id} className={`flex items-end gap-2 ${outgoing ? 'flex-row-reverse' : 'flex-row'}`}>
        {!outgoing && <IncomingAvatar src={senderPictureUrl} name={senderName} />}

        <div
          className={`max-w-[72%] ${isSticker ? 'bg-transparent border-0 shadow-none p-0' : `rounded-[1.5rem] border p-3 shadow-sm transition`} ${
            isSticker
              ? ''
              : outgoing
              ? 'border-line-green bg-line-green text-white'
              : 'border-line-green/20 bg-white text-slate-800'
          }`}
        >
          {renderContent(msg)}
          {!isSticker && (
            <div className={`mt-1.5 flex items-center justify-end gap-1 ${outgoing ? 'text-white/70' : 'text-slate-400'}`}>
              {showTimestamp && (
                <span className="text-[10px]">{timeStr}</span>
              )}
              {outgoing && <StatusIcon status={status} />}
              {status === 'failed' && onRetry && (
                <button
                  onClick={() => onRetry(msg)}
                  className="text-[11px] underline ml-1 hover:no-underline"
                >
                  ลองอีกครั้ง
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  });

  return (
    <div className="mb-4 flex-1 space-y-1 overflow-auto rounded-[1.75rem] border border-line-green/10 bg-white/70 p-4 shadow-sm">
      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">ยังไม่มีข้อความในการสนทนานี้</div>
      ) : (
        items
      )}
      <div ref={bottomRef} />
    </div>
  );
}

export const ChatTimeline = React.memo(ChatTimelineImpl);
