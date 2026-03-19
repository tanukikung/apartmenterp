'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

type ActionNotice = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

type ApiActionResult<T = unknown> = {
  ok: boolean;
  data: T | null;
  message: string;
};

type SettingsResponse = {
  success: boolean;
  data?: {
    lineChannelIdConfigured?: boolean;
    lineChannelSecretConfigured?: boolean;
    lineAccessTokenConfigured?: boolean;
  };
};

function extractApiMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const record = payload as {
      message?: string;
      error?: string | { message?: string };
    };
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message;
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error;
    }
    if (
      record.error &&
      typeof record.error === 'object' &&
      typeof record.error.message === 'string' &&
      record.error.message.trim()
    ) {
      return record.error.message;
    }
  }
  return fallback;
}

function normalizePaidAt(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

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
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [lineConfigured, setLineConfigured] = useState<boolean | null>(null);

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
    async function loadLineCapability() {
      try {
        const response = await fetch('/api/admin/settings', { cache: 'no-store' });
        const json = (await response.json().catch(() => null)) as SettingsResponse | null;
        if (!response.ok || !json?.success || !json.data) {
          setLineConfigured(null);
          return;
        }
        setLineConfigured(
          Boolean(
            json.data.lineChannelIdConfigured &&
            json.data.lineChannelSecretConfigured &&
            json.data.lineAccessTokenConfigured
          )
        );
      } catch {
        setLineConfigured(null);
      }
    }
    void loadLineCapability();
  }, []);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/conversations?page=1&pageSize=50').then((r) => r.json());
      if (res.success) setConversations(res.data.data);
    }
    void load();
  }, []);

  useEffect(() => {
    async function loadMessages() {
      if (!selectedId) return;
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
      }
    }
    void loadMessages();
  }, [selectedId]);

  const loadLatestInvoice = useCallback(async (conversationId: string | null) => {
    if (!conversationId) {
      setLatestInvoice(null);
      return;
    }
    const res = await fetch(`/api/conversations/${conversationId}/invoices/latest`).then((r) => r.json());
    if (res.success && res.data) {
      setLatestInvoice(res.data);
    } else {
      setLatestInvoice(null);
    }
  }, []);

  useEffect(() => {
    void loadLatestInvoice(selectedId);
  }, [loadLatestInvoice, selectedId]);

  useEffect(() => {
    setActionNotice(null);
  }, [selectedId]);

  const current = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) || null,
    [conversations, selectedId]
  );

  const setErrorNotice = useCallback((message: string) => {
    setActionNotice({ tone: 'error', message });
  }, []);

  const setSuccessNotice = useCallback((message: string) => {
    setActionNotice({ tone: 'success', message });
  }, []);

  const setInfoNotice = useCallback((message: string) => {
    setActionNotice({ tone: 'info', message });
  }, []);

  const callActionApi = useCallback(
    async <T,>(url: string, init: RequestInit, fallbackError: string): Promise<ApiActionResult<T>> => {
      try {
        const response = await fetch(url, init);
        const json = (await response.json().catch(() => null)) as
          | { success?: boolean; data?: T; message?: string; error?: string | { message?: string } }
          | null;
        if (!response.ok || !json?.success) {
          return {
            ok: false,
            data: null,
            message: extractApiMessage(json, fallbackError),
          };
        }
        return {
          ok: true,
          data: (json.data ?? null) as T | null,
          message: extractApiMessage(json, ''),
        };
      } catch {
        return {
          ok: false,
          data: null,
          message: fallbackError,
        };
      }
    },
    []
  );

  const loadOlder = useCallback(async () => {
    if (!selectedId || !oldestCursor || loadingMore) return;
    setLoadingMore(true);
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
      setLoadingMore(false);
    }
  }, [selectedId, oldestCursor, loadingMore]);

  const sendText = useCallback(async (text: string): Promise<boolean> => {
    if (!selectedId) return false;
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
      const response = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const res = await response.json().catch(() => null);
      if (response.ok && res?.success) {
        setMessages((items) => items.map((item) => (item.id === temp.id ? res.data : item)));
        return true;
      }
      setMessages((items) =>
        items.map((item) =>
          item.id === temp.id
            ? { ...item, localStatus: 'failed', metadata: { status: 'FAILED' } }
            : item
        )
      );
      setErrorNotice(extractApiMessage(res, 'Message could not be sent.'));
      return false;
    } catch {
      setMessages((items) => items.map((item) => (item.id === temp.id ? { ...item, localStatus: 'failed' } : item)));
      setErrorNotice('Message could not be sent.');
      return false;
    }
  }, [selectedId, setErrorNotice]);

  const retryMessage = useCallback(async (message: Message) => {
    if (!selectedId) return;
    if (message.type === 'TEXT') {
      await sendText(message.content);
      return;
    }
    try {
      const data = JSON.parse(message.content) as { id?: string; name?: string; contentType?: string };
      if (!data.id) {
        return;
      }
      const result = await callActionApi<{ messageId: string }>(
        `/api/conversations/${selectedId}/files/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: data.id,
          }),
        },
        'File could not be queued for delivery.',
      );
      if (!result.ok) {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === message.id ? { ...item, localStatus: 'failed', metadata: { status: 'FAILED' } } : item
          )
        );
        setErrorNotice(result.message);
        return;
      }
      setMessages((prev) =>
        prev.map((item) =>
          item.id === message.id ? { ...item, localStatus: 'queued', metadata: { status: 'QUEUED' } } : item
        )
      );
      setSuccessNotice('File queued for LINE delivery.');
    } catch {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === message.id ? { ...item, localStatus: 'failed', metadata: { status: 'FAILED' } } : item
        )
      );
      setErrorNotice('File could not be queued for delivery.');
    }
  }, [callActionApi, selectedId, sendText, setErrorNotice, setSuccessNotice]);

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

  const sendDisabledReason = useMemo(() => {
    if (!current?.lineUserId) {
      return 'Cannot send via LINE because tenant is not linked';
    }
    if (lineConfigured === false) {
      return 'LINE messaging is unavailable because credentials are not configured';
    }
    return null;
  }, [current?.lineUserId, lineConfigured]);

  const canSendViaLine = Boolean(current?.lineUserId) && lineConfigured !== false;

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

      const sendRes = await callActionApi<{ messageId: string }>(
        `/api/conversations/${selectedId}/files/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: info.id,
          }),
        },
        'File could not be queued for delivery.',
      );
      if (!sendRes.ok) throw new Error(sendRes.message);

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
      setSuccessNotice('File queued for LINE delivery.');
    } catch (error) {
      if (tempId) {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === tempId ? { ...item, localStatus: 'failed', metadata: { status: 'FAILED' } } : item
          )
        );
      }
      setErrorNotice(error instanceof Error ? error.message : 'File could not be queued for delivery.');
      setLastFailedFile(file);
      setLastFailedFileName(file.name);
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  }, [callActionApi, selectedId, setErrorNotice, setSuccessNotice]);

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
      setInfoNotice('No invoice is available to send for this conversation.');
      return;
    }
    const result = await callActionApi(
      `/api/invoices/${invoiceId}/send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendToLine: true }),
      },
      'Invoice could not be queued for LINE delivery.',
    );
    if (!result.ok) {
      setErrorNotice(result.message);
      return;
    }
    await loadLatestInvoice(selectedId);
    setSuccessNotice('Invoice queued for LINE delivery.');
  }, [callActionApi, loadLatestInvoice, resolveLatestInvoiceId, selectedId, setErrorNotice, setInfoNotice, setSuccessNotice]);

  const sendReminderQuick = useCallback(async () => {
    if (!selectedId) return;
    const result = await callActionApi(
      '/api/reminders/send',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedId,
          text: 'Payment reminder: please review your invoice.',
        }),
      },
      'Reminder could not be queued.',
    );
    if (!result.ok) {
      setErrorNotice(result.message);
      return;
    }
    setSuccessNotice('Reminder queued for LINE delivery.');
  }, [callActionApi, selectedId, setErrorNotice, setSuccessNotice]);

  const sendReceiptQuick = useCallback(async (paidAt?: string | null): Promise<boolean> => {
    if (!selectedId) return false;
    const invoiceId = await resolveLatestInvoiceId(selectedId);
    if (!invoiceId) {
      setInfoNotice('No receipt is available for this conversation.');
      return false;
    }
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const pdfUrl = `${base}/api/invoices/${encodeURIComponent(invoiceId)}/pdf`;
    const result = await callActionApi(
      `/api/receipts/${invoiceId}/send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedId,
          downloadLink: pdfUrl,
          paidDate: normalizePaidAt(paidAt) || null,
        }),
      },
      'Receipt could not be queued.',
    );
    if (!result.ok) {
      setErrorNotice(result.message);
      return false;
    }
    setSuccessNotice('Receipt queued for LINE delivery.');
    return true;
  }, [callActionApi, resolveLatestInvoiceId, selectedId, setErrorNotice, setInfoNotice, setSuccessNotice]);

  const confirmPaymentQuick = useCallback(async (paidAt?: string | null) => {
    if (!selectedId) return;
    const invoiceId = await resolveLatestInvoiceId(selectedId);
    if (!invoiceId) {
      setInfoNotice('No invoice is available to confirm payment for.');
      return;
    }
    const result = await callActionApi(
      `/api/invoices/${invoiceId}/pay`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidAt: normalizePaidAt(paidAt) || new Date().toISOString() }),
      },
      'Payment could not be confirmed.',
    );
    if (!result.ok) {
      setErrorNotice(result.message);
      return;
    }
    await loadLatestInvoice(selectedId);
    const receiptQueued = await sendReceiptQuick(paidAt);
    if (receiptQueued) {
      setSuccessNotice('Payment recorded and receipt queued for LINE delivery.');
      return;
    }
    setInfoNotice('Payment recorded, but the receipt could not be queued.');
  }, [callActionApi, loadLatestInvoice, resolveLatestInvoiceId, selectedId, sendReceiptQuick, setErrorNotice, setInfoNotice, setSuccessNotice]);

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

      {actionNotice ? (
        <div
          className={
            actionNotice.tone === 'success'
              ? 'auth-alert auth-alert-success'
              : actionNotice.tone === 'info'
              ? 'rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800'
              : 'auth-alert auth-alert-error'
          }
        >
          {actionNotice.message}
        </div>
      ) : null}

      {current?.lineUserId && lineConfigured === false ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          LINE messaging is unavailable because credentials are not configured. Chat sends and quick actions are disabled until LINE is configured.
        </div>
      ) : null}

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
              canSendViaLine={canSendViaLine}
              onSendFile={async (message) => {
                if (!selectedId) return;
                try {
                  const data = JSON.parse(message.content) as { id?: string };
                  if (!data.id) {
                    setErrorNotice('File could not be queued for delivery.');
                    return;
                  }
                  const result = await callActionApi<{ messageId: string }>(
                    `/api/conversations/${selectedId}/files/send`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ fileId: data.id }),
                    },
                    'File could not be queued for delivery.',
                  );
                  if (!result.ok) {
                    setErrorNotice(result.message);
                    return;
                  }
                  setMessages((prev) =>
                    prev.map((item) =>
                      item.id === message.id ? { ...item, localStatus: 'queued', metadata: { status: 'QUEUED' } } : item
                    )
                  );
                  setSuccessNotice('File queued for LINE delivery.');
                } catch {
                  setErrorNotice('File could not be queued for delivery.');
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
              disabled={!current || busy || !canSendViaLine}
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
            onConfirmPayment={() => void confirmPaymentQuick(null)}
            canSendViaLine={canSendViaLine}
            sendDisabledReason={sendDisabledReason}
          />
        </section>
      </div>
    </main>
  );
}
