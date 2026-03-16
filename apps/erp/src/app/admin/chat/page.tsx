'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatList, type Conversation as ChatListItem } from '@/components/chat/ChatList';
import { ChatTimeline } from '@/components/chat/ChatTimeline';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { RoomDetailsCard } from '@/components/chat/RoomDetailsCard';

type Conversation = {
  id: string;
  lineUserId: string;
  lastMessageAt: string;
  unreadCount: number;
  lineUser?: { displayName?: string | null } | null;
  room?: { roomNumber: string } | null;
  tenant?: { fullName: string; phone?: string | null } | null;
  overdue?: boolean | null;
  waitingPayment?: boolean | null;
};

type Message = {
  id: string;
  direction: 'INCOMING' | 'OUTGOING';
  type: string;
  content: string;
  sentAt: string;
  metadata?: Record<string, unknown> | null;
  localStatus?: 'sending' | 'queued' | 'sent' | 'failed';
};

export default function ChatInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [latestInvoice, setLatestInvoice] = useState<{ status: string; totalAmount: number; dueDate: string | null } | null>(null);
  const [lastFailedFile, setLastFailedFile] = useState<File | null>(null);
  const [lastFailedFileName, setLastFailedFileName] = useState<string | null>(null);
  const [msgTemplates, setMsgTemplates] = useState<{ id: string; label: string; text: string }[]>([]);
  const firstLoadTs = useRef<number | null>(null);

  // Load real MessageTemplate records from DB for compose quick-insert.
  useEffect(() => {
    async function loadTemplates() {
      try {
        const res = await fetch('/api/message-templates?pageSize=50').then((r) => r.json());
        if (res.success && Array.isArray(res.data?.templates)) {
          setMsgTemplates(
            (res.data.templates as { id: string; name: string; body: string }[]).map((t) => ({
              id: t.id,
              label: t.name,
              text: t.body,
            }))
          );
        }
      } catch {
        // Non-blocking: if fetch fails, chat still works without template shortcuts
      }
    }
    void loadTemplates();
  }, []);

  useEffect(() => {
    async function load() {
      const t0 = performance.now();
      const res = await fetch('/api/conversations?page=1&pageSize=50').then((r) => r.json());
      if (res.success) setConversations(res.data.data);
      const t1 = performance.now();
      console.log('chat_initial_conversations_ms', Math.round(t1 - t0));
    }
    void load();
  }, []);

  useEffect(() => {
    async function loadMessages() {
      if (!selectedId) return;
      firstLoadTs.current = performance.now();
      const res = await fetch(`/api/conversations/${selectedId}/messages?limit=30`).then((r) => r.json());
      if (res.success) {
        if (Array.isArray(res.data)) {
          setMessages(res.data);
          setHasMore(false);
          setOldestCursor(null);
        } else {
          setMessages(res.data.items);
          setHasMore(Boolean(res.data.hasMore));
          setOldestCursor(res.data.nextBefore || null);
        }
        const t1 = performance.now();
        console.log('chat_conversation_switch_ms', Math.round(t1 - (firstLoadTs.current || t1)));
      }
    }
    void loadMessages();
  }, [selectedId]);

  useEffect(() => {
    async function loadLatestInvoice() {
      if (!selectedId) {
        setLatestInvoice(null);
        return;
      }
      const res = await fetch(`/api/conversations/${selectedId}/invoices/latest`).then((r) => r.json());
      if (res.success && res.data) {
        setLatestInvoice(res.data);
      } else {
        setLatestInvoice(null);
      }
    }
    void loadLatestInvoice();
  }, [selectedId]);

  const current = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || null,
    [conversations, selectedId]
  );

  const loadOlder = useCallback(async () => {
    if (!selectedId || !oldestCursor || loadingMore) return;
    setLoadingMore(true);
    const t0 = performance.now();
    try {
      const res = await fetch(
        `/api/conversations/${selectedId}/messages?limit=30&before=${encodeURIComponent(oldestCursor)}`
      ).then((r) => r.json());
      if (res.success && res.data && Array.isArray(res.data.items)) {
        setMessages((prev) => [...res.data.items, ...prev]);
        setHasMore(Boolean(res.data.hasMore));
        setOldestCursor(res.data.nextBefore || null);
      }
    } finally {
      const t1 = performance.now();
      console.log('chat_load_more_ms', Math.round(t1 - t0));
      setLoadingMore(false);
    }
  }, [selectedId, oldestCursor, loadingMore]);

  const sendText = useCallback(async (text: string) => {
    if (!selectedId) return;
    const temp: Message = {
      id: `tmp-${Date.now()}`,
      direction: 'OUTGOING',
      type: 'TEXT',
      content: text,
      sentAt: new Date().toISOString(),
      localStatus: 'sending',
    };
    setMessages((items) => [...items, temp]);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());
      if (res.success) {
        setMessages((items) => items.map((item) => (item.id === temp.id ? res.data : item)));
      } else {
        setMessages((items) => items.map((item) => (item.id === temp.id ? { ...item, localStatus: 'failed' } : item)));
      }
    } catch {
      setMessages((items) => items.map((item) => (item.id === temp.id ? { ...item, localStatus: 'failed' } : item)));
    }
  }, [selectedId]);

  const retryMessage = useCallback(async (message: Message) => {
    if (!selectedId) return;
    if (message.type === 'TEXT') {
      await sendText(message.content);
      return;
    }
    if (message.type === 'FILE') {
      const data = JSON.parse(message.content) as { id: string; name: string; contentType?: string };
      await fetch('/api/messages/send-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedId,
          fileId: data.id,
          name: data.name,
          contentType: data.contentType,
        }),
      });
      setMessages((prev) =>
        prev.map((item) =>
          item.id === message.id ? { ...item, localStatus: 'queued', metadata: { status: 'QUEUED' } } : item
        )
      );
    }
  }, [selectedId, sendText]);

  const listItems: ChatListItem[] = useMemo(
    () =>
      conversations.map((conversation) => ({
        id: conversation.id,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: conversation.unreadCount,
        lineUser: conversation.lineUser || null,
        room: conversation.room || null,
        tenant: conversation.tenant || null,
        overdue: conversation.overdue ?? null,
        waitingPayment: conversation.waitingPayment ?? null,
      })),
    [conversations]
  );

  const uploadFile = useCallback(async (file: File) => {
    setBusy(true);
    let tempId: string | null = null;
    try {
      if (!selectedId) return;
      setLastFailedFile(null);
      setLastFailedFileName(null);
      tempId = `local-${Date.now()}`;
      const temp: Message = {
        id: tempId,
        direction: 'OUTGOING',
        type: 'FILE',
        content: JSON.stringify({
          id: 'uploading',
          name: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
        sentAt: new Date().toISOString(),
        localStatus: 'sending',
      };
      setMessages((prev) => [...prev, temp]);

      const fd = new FormData();
      fd.append('file', file);
      type UploadResponse = { success: boolean; data?: unknown; error?: string };
      const uploadRes = await new Promise<UploadResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/files');
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            setUploadProgress((evt.loaded / evt.total) * 100);
          }
        };
        xhr.onload = () => {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(fd);
      });
      if (!uploadRes.success) throw new Error(uploadRes.error || 'Upload failed');
      const info = uploadRes.data as { id: string; originalName: string; mimeType: string; url: string };

      const sendRes = await fetch(`/api/conversations/${selectedId}/files/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: info.id,
        }),
      }).then((r) => r.json());
      if (!sendRes.success) throw new Error(sendRes.error || 'Enqueue failed');

      setMessages((prev) =>
        prev.map((item) =>
          item.id === tempId
            ? {
                ...item,
                content: JSON.stringify({
                  id: info.id,
                  name: info.originalName,
                  contentType: info.mimeType,
                  previewUrl: info.url + '?inline=1',
                }),
                localStatus: 'queued',
                metadata: { status: 'QUEUED' },
              }
            : item
        )
      );
    } catch {
      if (tempId) {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === tempId ? { ...item, localStatus: 'failed', metadata: { status: 'FAILED' } } : item
          )
        );
      }
      setLastFailedFile(file);
      setLastFailedFileName(file.name);
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  }, [selectedId]);

  const retryLastUpload = useCallback(async () => {
    if (!lastFailedFile) return;
    const file = lastFailedFile;
    setLastFailedFile(null);
    setLastFailedFileName(null);
    await uploadFile(file);
  }, [lastFailedFile, uploadFile]);

  const resolveLatestInvoiceId = useCallback(async (conversationId: string): Promise<string | null> => {
    const res = await fetch(`/api/conversations/${conversationId}/invoices/latest`).then((r) => r.json());
    if (res.success && res.data && res.data.id) return res.data.id as string;
    return null;
  }, []);

  const sendInvoiceQuick = useCallback(async () => {
    if (!selectedId) return;
    const invoiceId = await resolveLatestInvoiceId(selectedId);
    if (!invoiceId) {
      await sendText('No invoice available to send.');
      return;
    }
    await fetch(`/api/invoices/${invoiceId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendToLine: true }),
    });
    await sendText('Invoice sending queued.');
  }, [selectedId, resolveLatestInvoiceId, sendText]);

  const sendReminderQuick = useCallback(async () => {
    if (!selectedId) return;
    await fetch('/api/reminders/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: selectedId,
        text: 'Payment reminder: please review your invoice.',
      }),
    });
    await sendText('Reminder queued.');
  }, [selectedId, sendText]);

  const sendReceiptQuick = useCallback(async (paidAt?: string | null) => {
    if (!selectedId) return;
    const invoiceId = await resolveLatestInvoiceId(selectedId);
    if (!invoiceId) {
      await sendText('No receipt available.');
      return;
    }
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const pdfUrl = `${base}/api/invoices/${encodeURIComponent(invoiceId)}/pdf`;
    await fetch(`/api/receipts/${invoiceId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: selectedId,
        downloadLink: pdfUrl,
        paidDate: paidAt || null,
      }),
    });
    await sendText('Receipt sending queued.');
  }, [selectedId, resolveLatestInvoiceId, sendText]);

  const confirmPaymentQuick = useCallback(async (paidAt?: string | null) => {
    if (!selectedId) return;
    const invoiceId = await resolveLatestInvoiceId(selectedId);
    if (!invoiceId) {
      await sendText('No invoice to confirm payment for.');
      return;
    }
    await fetch(`/api/invoices/${invoiceId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paidAt: paidAt || new Date().toISOString() }),
    });
    await sendText('Payment confirmed.');
    await sendReceiptQuick(paidAt);
  }, [selectedId, resolveLatestInvoiceId, sendText, sendReceiptQuick]);

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Chat</h1>
          <p className="admin-page-subtitle">Conversation inbox for tenant messaging, invoice delivery, payment reminders, and receipt follow-up.</p>
        </div>
        <div className="admin-toolbar">
          <span className="admin-badge">{conversations.length} conversations</span>
          <span className="admin-badge">{conversations.filter((item) => item.unreadCount > 0).length} unread</span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="lg:col-span-3">
          <ChatList items={listItems} selectedId={selectedId} onSelect={setSelectedId} widthClass="w-full" />
        </section>

        <section className="admin-card lg:col-span-6">
          <div className="admin-card-header">
            <div>
              <div className="admin-card-title">Conversation Timeline</div>
              <div className="mt-1 text-sm text-slate-500">
                {current ? `Room ${current.room?.roomNumber || '-'} • ${current.tenant?.fullName || 'Unlinked tenant'}` : 'Select a conversation'}
              </div>
            </div>
            {hasMore ? (
              <button onClick={loadOlder} disabled={loadingMore} className="admin-button">
                {loadingMore ? 'Loading...' : 'Load older'}
              </button>
            ) : null}
          </div>
          <div className="flex h-[75vh] flex-col p-4">
            <ChatTimeline
              messages={messages}
              onRetry={retryMessage}
              canSendViaLine={Boolean(current?.lineUser)}
              onSendFile={async (message) => {
                if (!selectedId) return;
                try {
                  const data = JSON.parse(message.content) as { id: string };
                  await fetch(`/api/conversations/${selectedId}/files/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fileId: data.id }),
                  });
                  setMessages((prev) =>
                    prev.map((item) =>
                      item.id === message.id ? { ...item, localStatus: 'queued', metadata: { status: 'QUEUED' } } : item
                    )
                  );
                } catch {
                  return;
                }
              }}
              onConfirmSlip={async (slip) => {
                try {
                  await confirmPaymentQuick(slip.date ?? null);
                } catch {
                  return;
                }
              }}
            />
            <ChatComposer
              disabled={!current || busy || !current?.lineUserId}
              onSendText={sendText}
              onUploadFile={uploadFile}
              uploadProgress={uploadProgress}
              onRetryUpload={lastFailedFile ? retryLastUpload : null}
              failedUploadName={lastFailedFileName}
              templates={msgTemplates}
            />
          </div>
        </section>

        <section className="lg:col-span-3">
          <RoomDetailsCard
            roomNumber={current?.room?.roomNumber || null}
            tenantName={current?.tenant?.fullName || null}
            phone={current?.tenant?.phone || null}
            lineLinked={Boolean(current?.lineUser)}
            contractStatus={null}
            moveInDate={null}
            endDate={null}
            currentAmount={latestInvoice?.totalAmount ?? null}
            dueDate={latestInvoice?.dueDate ?? null}
            overdueDays={
              latestInvoice?.dueDate
                ? Math.max(
                    0,
                    Math.ceil(
                      (new Date().getTime() - new Date(latestInvoice.dueDate).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                  )
                : null
            }
            lastPayment={null}
            invoiceStatus={latestInvoice?.status ?? null}
            onSendInvoice={sendInvoiceQuick}
            onSendReminder={sendReminderQuick}
            onSendReceipt={() => void sendReceiptQuick(null)}
            onUploadFile={() => undefined}
            onConfirmPayment={() => void confirmPaymentQuick(null)}
            canSendViaLine={Boolean(current?.lineUser)}
            sendDisabledReason="Cannot send via LINE because tenant is not linked"
          />
        </section>
      </div>
    </main>
  );
}
