'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatList, type Conversation as ChatListItem } from '@/components/chat/ChatList';
import { ChatTimeline } from '@/components/chat/ChatTimeline';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { RoomDetailsCard } from '@/components/chat/RoomDetailsCard';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AlertTriangle } from 'lucide-react';

type Conversation = {
  id: string;
  lineUserId: string;
  lastMessageAt: string;
  unreadCount: number;
  lineUser?: { displayName?: string | null; pictureUrl?: string | null } | null;
  room?: { roomNumber?: string; roomNo?: string } | null;
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
  localStatus?: 'sending' | 'queued' | 'sent' | 'failed' | 'delivered' | 'read';
};

type ActionNotice = { tone: 'success' | 'error' | 'info'; message: string };

type ApiActionResult<T = unknown> = { ok: boolean; data: T | null; message: string };

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
    const record = payload as { message?: string; error?: string | { message?: string } };
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
    if (record.error && typeof record.error === 'object' && typeof (record.error as { message?: string }).message === 'string' && (record.error as { message: string }).message.trim()) return (record.error as { message: string }).message;
  }
  return fallback;
}

function normalizePaidAt(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export default function ChatInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
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
  const [roomDocuments, setRoomDocuments] = useState<Array<{
    id: string;
    title: string;
    documentType: string;
    year: number | null;
    month: number | null;
    hasPdf: boolean;
    generatedAt: string;
  }> | null>(null);
  const [roomDocsLoading, setRoomDocsLoading] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [reminderConfirmOpen, setReminderConfirmOpen] = useState(false);
  const [invoiceConfirmOpen, setInvoiceConfirmOpen] = useState(false);
  const [pollingError, setPollingError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTemplates() {
      try {
        const res = await fetch('/api/message-templates?pageSize=50').then((r) => r.json());
        if (res.success && Array.isArray(res.data?.templates)) {
          setMsgTemplates(
            (res.data.templates as { id: string; name: string; body: string }[]).map((t) => ({ id: t.id, label: t.name, text: t.body }))
          );
        }
      } catch { /* non-blocking */ }
    }
    void loadTemplates();
  }, []);

  useEffect(() => {
    async function loadLineCapability() {
      try {
        const response = await fetch('/api/admin/settings', { cache: 'no-store' });
        const json = (await response.json().catch(() => null)) as SettingsResponse | null;
        if (!response.ok || !json?.success || !json.data) { setLineConfigured(null); return; }
        setLineConfigured(Boolean(json.data.lineChannelIdConfigured && json.data.lineChannelSecretConfigured && json.data.lineAccessTokenConfigured));
      } catch { setLineConfigured(null); }
    }
    void loadLineCapability();
  }, []);

  useEffect(() => {
    async function load() {
      setConversationsLoading(true);
      try {
        const res = await fetch('/api/conversations?page=1&pageSize=50').then((r) => r.json());
        if (res.success) setConversations(res.data.data);
      } finally {
        setConversationsLoading(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    async function loadMessages() {
      if (!selectedId) return;
      const res = await fetch(`/api/conversations/${selectedId}/messages?limit=30`).then((r) => r.json());
      if (res.success) {
        if (Array.isArray(res.data)) { setMessages(res.data); setHasMore(false); setOldestCursor(null); }
        else { setMessages(res.data.items); setHasMore(Boolean(res.data.hasMore)); setOldestCursor(res.data.nextBefore || null); }
      }
    }
    void loadMessages();
  }, [selectedId]);

  // Mark conversation as read when selected
  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/conversations?conversationId=${selectedId}`, { method: 'PATCH' }).catch(() => undefined);
    setConversations((prev) =>
      prev.map((c) => c.id === selectedId ? { ...c, unreadCount: 0 } : c)
    );
  }, [selectedId]);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/conversations?page=1&pageSize=50').then((r) => r.json());
        if (res.success) { setConversations(res.data.data); setPollingError(null); }
      } catch (err) {
        console.error('Poll conversations failed:', err);
        setPollingError('การเชื่อมต่อเซิร์ฟเวอร์ขัดข้อง กรุณารอสักครู่...');
      }
    }, 5000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/${selectedId}/messages?limit=30`).then((r) => r.json());
        if (!res.success) return;
        const items: Message[] = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
        if (!items.length) return;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newItems = items.filter((m) => !existingIds.has(m.id));
          if (!newItems.length) return prev;
          return [...prev, ...newItems];
        });
      } catch (err) {
        console.error('Poll messages failed:', err);
        setPollingError('การเชื่อมต่อเซิร์ฟเวอร์ขัดข้อง กรุณารอสักครู่...');
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [selectedId]);

  const loadLatestInvoice = useCallback(async (conversationId: string | null) => {
    if (!conversationId) { setLatestInvoice(null); return; }
    const res = await fetch(`/api/conversations/${conversationId}/invoices/latest`).then((r) => r.json());
    if (res.success && res.data) setLatestInvoice(res.data);
    else setLatestInvoice(null);
  }, []);

  useEffect(() => { void loadLatestInvoice(selectedId); }, [loadLatestInvoice, selectedId]);
  useEffect(() => { setActionNotice(null); }, [selectedId]);

  const loadRoomDocuments = useCallback(async (roomNumber: string | null | undefined) => {
    if (!roomNumber) { setRoomDocuments(null); return; }
    setRoomDocsLoading(true);
    try {
      const res = await fetch(`/api/documents?roomId=${encodeURIComponent(roomNumber)}&pageSize=10`).then((r) => r.json());
      if (res.success && Array.isArray(res.data?.documents)) {
        setRoomDocuments(
          (res.data.documents as Array<{ id: string; title: string; documentType: string; year: number | null; month: number | null; files?: Array<{ role: string }>; generatedAt: string }>).map((d) => ({
            id: d.id,
            title: d.title,
            documentType: d.documentType,
            year: d.year ?? null,
            month: d.month ?? null,
            hasPdf: Array.isArray(d.files) && d.files.some((f) => f.role === 'PDF'),
            generatedAt: d.generatedAt,
          }))
        );
      } else {
        setRoomDocuments([]);
      }
    } catch {
      setRoomDocuments([]);
    } finally {
      setRoomDocsLoading(false);
    }
  }, []);

  const current = useMemo(() => conversations.find((conversation) => conversation.id === selectedId) || null, [conversations, selectedId]);

  const setErrorNotice = useCallback((message: string) => { setActionNotice({ tone: 'error', message }); }, []);
  const setSuccessNotice = useCallback((message: string) => { setActionNotice({ tone: 'success', message }); }, []);
  const setInfoNotice = useCallback((message: string) => { setActionNotice({ tone: 'info', message }); }, []);

  const currentRoomNum = current?.room?.roomNumber ?? current?.room?.roomNo;
  useEffect(() => { void loadRoomDocuments(currentRoomNum); }, [loadRoomDocuments, currentRoomNum]);

  const callActionApi = useCallback(async <T,>(url: string, init: RequestInit, fallbackError: string): Promise<ApiActionResult<T>> => {
    try {
      const response = await fetch(url, init);
      const json = (await response.json().catch(() => null)) as { success?: boolean; data?: T; message?: string; error?: string | { message?: string } } | null;
      if (!response.ok || !json?.success) return { ok: false, data: null, message: extractApiMessage(json, fallbackError) };
      return { ok: true, data: (json.data ?? null) as T | null, message: extractApiMessage(json, '') };
    } catch { return { ok: false, data: null, message: fallbackError }; }
  }, []);

  const sendDocument = useCallback(async (documentId: string) => {
    const result = await callActionApi(`/api/documents/${documentId}/send`, { method: 'POST' }, 'ไม่สามารถส่งเอกสารได้');
    if (!result.ok) { setErrorNotice(result.message); return; }
    setSuccessNotice('เอกสารถูกส่งไปยัง LINE แล้ว (รอ delivery confirmation)');
  }, [callActionApi, setErrorNotice, setSuccessNotice]);

  const loadOlder = useCallback(async () => {
    if (!selectedId || !oldestCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages?limit=30&before=${encodeURIComponent(oldestCursor)}`).then((r) => r.json());
      if (res.success && res.data && Array.isArray(res.data.items)) {
        setMessages((prev) => [...res.data.items, ...prev]);
        setHasMore(Boolean(res.data.hasMore));
        setOldestCursor(res.data.nextBefore || null);
      }
    } finally { setLoadingMore(false); }
  }, [selectedId, oldestCursor, loadingMore]);

  const sendText = useCallback(async (text: string): Promise<boolean> => {
    if (!selectedId) return false;
    const temp: Message = { id: `tmp-${Date.now()}`, direction: 'OUTGOING', type: 'TEXT', content: text, sentAt: new Date().toISOString(), localStatus: 'sending' };
    setMessages((items) => [...items, temp]);
    try {
      const response = await fetch(`/api/conversations/${selectedId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const res = await response.json().catch(() => null);
      if (response.ok && res?.success) { setMessages((items) => items.map((item) => (item.id === temp.id ? res.data : item))); return true; }
      setMessages((items) => items.map((item) => item.id === temp.id ? { ...item, localStatus: 'failed', metadata: { status: 'FAILED' } } : item));
      setErrorNotice(extractApiMessage(res, 'ไม่สามารถส่งข้อความได้'));
      return false;
    } catch {
      setMessages((items) => items.map((item) => item.id === temp.id ? { ...item, localStatus: 'failed' } : item));
      setErrorNotice('ไม่สามารถส่งข้อความได้');
      return false;
    }
  }, [selectedId, setErrorNotice]);

  const retryMessage = useCallback(async (message: Message) => {
    if (!selectedId) return;
    if (message.type === 'TEXT') { await sendText(message.content); return; }
    try {
      const data = JSON.parse(message.content) as { id?: string; name?: string; contentType?: string };
      if (!data.id) return;
      const result = await callActionApi<{ messageId: string }>(`/api/conversations/${selectedId}/files/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: data.id }) }, 'ไม่สามารถส่งไฟล์ได้');
      if (!result.ok) {
        setMessages((prev) => prev.map((item) => item.id === message.id ? { ...item, localStatus: 'failed', metadata: { status: 'FAILED' } } : item));
        setErrorNotice(result.message); return;
      }
      setMessages((prev) => prev.map((item) => item.id === message.id ? { ...item, localStatus: 'queued', metadata: { status: 'QUEUED' } } : item));
      setSuccessNotice('ไฟล์ถูกส่งไปยัง LINE แล้ว (รอ delivery confirmation)');
    } catch {
      setMessages((prev) => prev.map((item) => item.id === message.id ? { ...item, localStatus: 'failed', metadata: { status: 'FAILED' } } : item));
      setErrorNotice('ไม่สามารถส่งไฟล์ได้');
    }
  }, [callActionApi, selectedId, sendText, setErrorNotice, setSuccessNotice]);

  const listItems: ChatListItem[] = useMemo(() => conversations.map((conversation) => ({
    id: conversation.id, lastMessageAt: conversation.lastMessageAt, unreadCount: conversation.unreadCount,
    lineUser: conversation.lineUser ? { displayName: conversation.lineUser.displayName ?? null, pictureUrl: conversation.lineUser.pictureUrl ?? null } : null,
    room: conversation.room || null, tenant: conversation.tenant || null,
    overdue: conversation.overdue ?? null, waitingPayment: conversation.waitingPayment ?? null,
  })), [conversations]);

  const sendDisabledReason = useMemo(() => {
    if (!current?.lineUserId) return 'ไม่สามารถส่งผ่าน LINE ได้เนื่องจากผู้เช่ายังไม่ได้เชื่อมต่อ';
    if (lineConfigured === false) return 'การส่งข้อความ LINE ไม่พร้อมใช้งานเนื่องจากยังไม่ได้ตั้งค่าข้อมูลรับรอง';
    return null;
  }, [current?.lineUserId, lineConfigured]);

  const canSendViaLine = Boolean(current?.lineUserId) && lineConfigured !== false;

  const uploadFile = useCallback(async (file: File) => {
    setBusy(true); let tempId: string | null = null;
    try {
      if (!selectedId) return;
      setLastFailedFile(null); setLastFailedFileName(null);
      tempId = `local-${Date.now()}`;
      const temp: Message = { id: tempId, direction: 'OUTGOING', type: 'FILE', content: JSON.stringify({ id: 'uploading', name: file.name, contentType: file.type || 'application/octet-stream' }), sentAt: new Date().toISOString(), localStatus: 'sending' };
      setMessages((prev) => [...prev, temp]);

      const fd = new FormData(); fd.append('file', file);
      type UploadResponse = { success: boolean; data?: unknown; error?: string };
      const uploadRes = await new Promise<UploadResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/files');
        xhr.upload.onprogress = (evt) => { if (evt.lengthComputable) setUploadProgress((evt.loaded / evt.total) * 100); };
        xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('อัปโหลดไม่สำเร็จ')); } };
        xhr.onerror = () => reject(new Error('อัปโหลดไม่สำเร็จ'));
        xhr.send(fd);
      });
      if (!uploadRes.success) throw new Error((uploadRes as { error?: string }).error || 'อัปโหลดไม่สำเร็จ');
      const info = (uploadRes as { data: { id: string; originalName: string; mimeType: string; url: string } }).data;

      const sendRes = await callActionApi<{ messageId: string }>(`/api/conversations/${selectedId}/files/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: info.id }) }, 'ไม่สามารถส่งไฟล์ได้');
      if (!sendRes.ok) throw new Error(sendRes.message);

      setMessages((prev) => prev.map((item) => item.id === tempId ? { ...item, content: JSON.stringify({ id: info.id, name: info.originalName, contentType: info.mimeType, previewUrl: info.url + '?inline=1' }), localStatus: 'queued', metadata: { status: 'QUEUED' } } : item));
      setSuccessNotice('ไฟล์ถูกส่งไปยัง LINE แล้ว (รอ delivery confirmation)');
    } catch (error) {
      if (tempId) setMessages((prev) => prev.map((item) => item.id === tempId ? { ...item, localStatus: 'failed', metadata: { status: 'FAILED' } } : item));
      setErrorNotice(error instanceof Error ? error.message : 'ไม่สามารถส่งไฟล์ได้');
      setLastFailedFile(file); setLastFailedFileName(file.name);
    } finally { setBusy(false); setUploadProgress(null); }
  }, [callActionApi, selectedId, setErrorNotice, setSuccessNotice]);

  const retryLastUpload = useCallback(async () => {
    if (!lastFailedFile) return;
    const file = lastFailedFile; setLastFailedFile(null); setLastFailedFileName(null);
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
    if (!invoiceId) { setInfoNotice('ไม่มีใบแจ้งหนี้ที่สามารถส่งได้สำหรับการสนทนานี้'); return; }
    const result = await callActionApi(`/api/invoices/${invoiceId}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sendToLine: true }) }, 'ไม่สามารถส่งใบแจ้งหนี้ได้');
    if (!result.ok) { setErrorNotice(result.message); return; }
    await loadLatestInvoice(selectedId);
    setSuccessNotice('ใบแจ้งหนี้ถูกส่งไปยัง LINE แล้ว (รอ delivery confirmation)');
  }, [callActionApi, loadLatestInvoice, resolveLatestInvoiceId, selectedId, setErrorNotice, setInfoNotice, setSuccessNotice]);

  const sendReminderQuick = useCallback(async () => {
    if (!selectedId) return;
    const result = await callActionApi('/api/reminders/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: selectedId, text: 'แจ้งเตือนการชำระ: กรุณาตรวจสอบใบแจ้งหนี้ของคุณ' }) }, 'ไม่สามารถส่งการเตือนได้');
    if (!result.ok) { setErrorNotice(result.message); return; }
    setSuccessNotice('การเตือนถูกส่งไปยัง LINE แล้ว (รอ delivery confirmation)');
  }, [callActionApi, selectedId, setErrorNotice, setSuccessNotice]);

  const sendReceiptQuick = useCallback(async (paidAt?: string | null): Promise<boolean> => {
    if (!selectedId) return false;
    const invoiceId = await resolveLatestInvoiceId(selectedId);
    if (!invoiceId) { setInfoNotice('ไม่มีใบเสร็จที่สามารถส่งได้สำหรับการสนทนานี้'); return false; }
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const pdfUrl = `${base}/api/invoices/${encodeURIComponent(invoiceId)}/pdf`;
    const result = await callActionApi(`/api/receipts/${invoiceId}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: selectedId, downloadLink: pdfUrl, paidDate: normalizePaidAt(paidAt) || null }) }, 'ไม่สามารถส่งใบเสร็จได้');
    if (!result.ok) { setErrorNotice(result.message); return false; }
    setSuccessNotice('ใบเสร็จถูกส่งไปยัง LINE แล้ว (รอ delivery confirmation)'); return true;
  }, [callActionApi, resolveLatestInvoiceId, selectedId, setErrorNotice, setInfoNotice, setSuccessNotice]);

  const confirmPaymentQuick = useCallback(async (paidAt?: string | null) => {
    if (!selectedId) return;
    const invoiceId = await resolveLatestInvoiceId(selectedId);
    if (!invoiceId) { setInfoNotice('ไม่มีใบแจ้งหนี้ที่สามารถยืนยันการชำระเงินได้'); return; }
    const result = await callActionApi(`/api/invoices/${invoiceId}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paidAt: normalizePaidAt(paidAt) || new Date().toISOString() }) }, 'ไม่สามารถยืนยันการชำระเงินได้');
    if (!result.ok) { setErrorNotice(result.message); return; }
    await loadLatestInvoice(selectedId);
    const receiptQueued = await sendReceiptQuick(paidAt);
    if (receiptQueued) { setSuccessNotice('ชำระเงินเรียบร้อยแล้วและใบเสร็จถูกส่งไปยัง LINE แล้ว (รอ delivery confirmation)'); return; }
    setInfoNotice('ชำระเงินเรียบร้อยแล้ว แต่ไม่สามารถส่งใบเสร็จได้');
  }, [callActionApi, loadLatestInvoice, resolveLatestInvoiceId, selectedId, sendReceiptQuick, setErrorNotice, setInfoNotice, setSuccessNotice]);

  // ── LINE OA quick reply handlers ──────────────────────────────────────────
  const QUICK_REPLIES = [
    { label: 'ดูใบแจ้งหนี้', icon: '📄', action: 'postback:view_invoice' },
    { label: 'ยืนยันชำระเงิน', icon: '💳', action: 'postback:confirm_payment' },
    { label: 'ส่งใบเสร็จ', icon: '📋', action: 'postback:send_receipt' },
  ];

  const handleQuickReply = useCallback(async (action: string) => {
    if (!selectedId) return;
    const invoiceId = await resolveLatestInvoiceId(selectedId);
    const result = await callActionApi(`/api/chat/quick-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: selectedId, action, invoiceId }),
    }, 'ไม่สามารถส่งได้');
    if (!result.ok) { setErrorNotice(result.message); return; }
    if (action === 'postback:view_invoice') setSuccessNotice('📄 Flex ถูกส่งไปยัง LINE แล้ว พร้อมปุ่มลัด');
    else if (action === 'postback:confirm_payment') setSuccessNotice('✅ ยืนยันการชำระเงินแล้ว');
    else if (action === 'postback:send_receipt') setSuccessNotice('📋 ใบเสร็จถูกส่งไป LINE แล้ว');
  }, [selectedId, resolveLatestInvoiceId, callActionApi, setErrorNotice, setSuccessNotice]);

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">แชท</h1>
          <p className="mt-1 text-sm text-on-surface-variant">กล่องข้อความสำหรับสื่อสารกับผู้เช่า ส่งใบแจ้งหนี้ และติดตามใบเสร็จ</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant">
            การสนทนา {conversations.length} รายการ
          </span>
          <span className="inline-flex items-center rounded-full bg-error-container px-3 py-1 text-xs font-semibold text-on-error-container">
            ยังไม่อ่าน {conversations.filter((item) => item.unreadCount > 0).length} รายการ
          </span>
        </div>
      </div>

      {actionNotice ? (
        <div className={
          actionNotice.tone === 'success' ? 'flex items-center gap-3 rounded-xl border border-tertiary-container bg-tertiary-container/20 px-4 py-3 text-sm text-on-tertiary-container'
            : actionNotice.tone === 'info' ? 'flex items-center gap-3 rounded-xl border border-primary-container bg-primary-container/20 px-4 py-3 text-sm text-primary-container'
            : 'flex items-center gap-3 rounded-xl border border-error-container bg-error-container/20 px-4 py-3 text-sm text-on-error-container'
        }>
          {actionNotice.message}
        </div>
      ) : null}

      {pollingError ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {pollingError}
        </div>
      ) : null}

      {current?.lineUserId && lineConfigured === false ? (
        <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
          การส่งข้อความ LINE ไม่พร้อมใช้งานเนื่องจากยังไม่ได้ตั้งค่าข้อมูลรับรอง การส่งแชทและการดำเนินการด่วนจะถูกปิดใช้งานจนกว่าจะตั้งค่า LINE
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 anim-fade-in">
        {/* Chat list sidebar */}
        <section className="lg:col-span-3">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="border-b border-outline-variant px-4 py-3">
              <span className="text-sm font-semibold text-on-surface">การสนทนา</span>
            </div>
            {conversationsLoading ? (
              <div className="flex items-center justify-center p-8">
                <svg className="h-6 w-6 animate-spin text-on-surface-variant" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.878 3 8.291l2-2z" />
                </svg>
              </div>
            ) : (
              <ChatList items={listItems} selectedId={selectedId} onSelect={setSelectedId} widthClass="w-full" />
            )}
          </div>
        </section>

        {/* Chat timeline */}
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 lg:col-span-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-on-surface">ไทม์ไลน์การสนทนา</div>
              <div className="mt-0.5 text-xs text-on-surface-variant">
                {current ? `ห้อง ${current.room?.roomNumber ?? current.room?.roomNo ?? '-'} • ${current.tenant?.fullName || 'ผู้เช่าที่ยังไม่ได้เชื่อมต่อ'}` : 'เลือกการสนทนา'}
              </div>
            </div>
            {hasMore && (
              <button onClick={loadOlder} disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container">
                {loadingMore ? 'กำลังโหลด...' : 'โหลดข้อความเก่ากว่า'}
              </button>
            )}
          </div>
          <div className="flex h-[75vh] flex-col p-4">
            <ChatTimeline
              messages={messages}
              senderPictureUrl={current?.lineUser?.pictureUrl ?? null}
              senderName={current?.lineUser?.displayName ?? current?.tenant?.fullName ?? undefined}
              onRetry={retryMessage}
              canSendViaLine={canSendViaLine}
              onSendFile={async (message) => {
                if (!selectedId) return;
                try {
                  const data = JSON.parse(message.content) as { id?: string };
                  if (!data.id) { setErrorNotice('ไม่สามารถส่งไฟล์ได้'); return; }
                  const result = await callActionApi<{ messageId: string }>(`/api/conversations/${selectedId}/files/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: data.id }) }, 'ไม่สามารถส่งไฟล์ได้');
                  if (!result.ok) { setErrorNotice(result.message); return; }
                  setMessages((prev) => prev.map((item) => item.id === message.id ? { ...item, localStatus: 'queued', metadata: { status: 'QUEUED' } } : item));
                  setSuccessNotice('ไฟล์ถูกส่งไปยัง LINE แล้ว (รอ delivery confirmation)');
                } catch { setErrorNotice('ไม่สามารถส่งไฟล์ได้'); }
              }}
              onConfirmSlip={async (slip) => { try { await confirmPaymentQuick(slip.date ?? null); } catch { setErrorNotice('ยืนยันการชำระเงินไม่สำเร็จ'); } }}
            />
            <ChatComposer
              disabled={!current || busy || !canSendViaLine}
              onSendText={sendText}
              onUploadFile={uploadFile}
              uploadProgress={uploadProgress}
              onRetryUpload={lastFailedFile ? retryLastUpload : null}
              failedUploadName={lastFailedFileName}
              templates={msgTemplates}
              quickReplies={canSendViaLine ? QUICK_REPLIES : []}
              onQuickReply={canSendViaLine ? handleQuickReply : undefined}
            />
          </div>
        </section>

        {/* Room details sidebar */}
        <section className="lg:col-span-3">
          <RoomDetailsCard
            roomNumber={(current?.room?.roomNumber ?? current?.room?.roomNo) || null}
            tenantName={current?.tenant?.fullName || null}
            phone={current?.tenant?.phone || null}
            lineLinked={Boolean(current?.lineUser)}
            contractStatus={null}
            moveInDate={null}
            endDate={null}
            currentAmount={latestInvoice?.totalAmount ?? null}
            dueDate={latestInvoice?.dueDate ?? null}
            overdueDays={latestInvoice?.dueDate ? (() => { const days = Math.ceil((new Date().getTime() - new Date(latestInvoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)); return days > 0 ? days : null; })() : null}
            lastPayment={null}
            invoiceStatus={latestInvoice?.status ?? null}
            onSendInvoice={() => { if (!canSendViaLine) { setErrorNotice(sendDisabledReason || 'LINE ไม่พร้อม'); return; } setInvoiceConfirmOpen(true); }}
            onSendReminder={() => { if (!canSendViaLine) { setErrorNotice(sendDisabledReason || 'LINE ไม่พร้อม'); return; } setReminderConfirmOpen(true); }}
            onSendReceipt={() => { if (!canSendViaLine) { setErrorNotice(sendDisabledReason || 'LINE ไม่พร้อม'); return; } void sendReceiptQuick(null); }}
            onConfirmPayment={() => { if (!latestInvoice) { setInfoNotice('ไม่มีใบแจ้งหนี้ที่สามารถยืนยันการชำระเงินได้'); return; } setPaymentConfirmOpen(true); }}
            canSendViaLine={canSendViaLine}
            sendDisabledReason={sendDisabledReason}
            documents={roomDocuments}
            documentsLoading={roomDocsLoading}
            onSendDocument={(id) => void sendDocument(id)}
          />
        </section>
      </div>
      <ConfirmDialog
        open={paymentConfirmOpen}
        title="ยืนยันการชำระเงิน?"
        description={`ยืนยันว่าห้อง ${current?.room?.roomNumber ?? current?.room?.roomNo ?? '-'} ได้ชำระเงินแล้ว ระบบจะอัปเดตสถานะใบแจ้งหนี้และส่งใบเสร็จให้ผู้เช่า`}
        confirmLabel="ยืนยันชำระเงิน"
        cancelLabel="ยกเลิก"
        onConfirm={() => { setPaymentConfirmOpen(false); void confirmPaymentQuick(null); }}
        onCancel={() => setPaymentConfirmOpen(false)}
      />
      <ConfirmDialog
        open={reminderConfirmOpen}
        title="ส่ง Reminder ถึงผู้เช่า?"
        description={`ส่ง LINE reminder ไปยังผู้เช่าห้อง ${current?.room?.roomNumber ?? current?.room?.roomNo ?? '-'}`}
        confirmLabel="ส่งเลย"
        cancelLabel="ยกเลิก"
        onConfirm={() => { setReminderConfirmOpen(false); void sendReminderQuick(); }}
        onCancel={() => setReminderConfirmOpen(false)}
      />
      <ConfirmDialog
        open={invoiceConfirmOpen}
        title="ส่งใบแจ้งหนี้?"
        description={`ส่งใบแจ้งหนี้ LINE ไปยังผู้เช่าห้อง ${current?.room?.roomNumber ?? current?.room?.roomNo ?? '-'}`}
        confirmLabel="ส่งเลย"
        cancelLabel="ยกเลิก"
        onConfirm={() => { setInvoiceConfirmOpen(false); void sendInvoiceQuick(); }}
        onCancel={() => setInvoiceConfirmOpen(false)}
      />
    </main>
  );
}
