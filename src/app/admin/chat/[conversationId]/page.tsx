'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ArrowLeft, Send, User, MessageSquare } from 'lucide-react';

type Message = {
  id: string;
  content: string;
  direction: 'INCOMING' | 'OUTGOING';
  sentAt: string;
  metadata?: Record<string, unknown> | null;
  sender?: string | null;
};

type Conversation = {
  id: string;
  lineUserId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  tenant?: {
    id: string;
    fullName: string;
    phone: string;
  } | null;
  messages?: Message[];
};

export default function ChatConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, { cache: 'no-store' }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถโหลดการสนทนาได้');
      const conv: Conversation = res.data;
      setConversation(conv);
      setMessages(conv.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดการสนทนาได้');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendReply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = replyText.trim();
    if (!text) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถส่งข้อความได้');
      setReplyText('');
      await load();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'ไม่สามารถส่งข้อความได้');
    } finally {
      setSending(false);
    }
  }

  const tenantName = conversation?.tenant?.fullName ?? conversation?.lineUserId ?? 'ไม่ทราบ';

  return (
    <main className="space-y-6">
      {/* Header */}
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/chat"
            className="flex items-center gap-1 text-sm font-medium text-on-primary/80 hover:text-on-primary"
          >
            <ArrowLeft className="h-4 w-4" /> แชท
          </Link>
          <span className="text-on-primary/40">/</span>
          <div>
            <h1 className="text-xl font-semibold text-on-primary">{tenantName}</h1>
            <p className="text-sm text-on-primary/80">
              {conversation ? `การสนทนา · ${conversation.status}` : 'กำลังโหลดการสนทนา...'}
            </p>
          </div>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {/* Chat layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Message thread */}
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 flex flex-col overflow-hidden" style={{ minHeight: '60vh' }}>
          <div className="px-5 py-4 border-b border-outline-variant">
            <div className="text-sm font-semibold text-primary flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              ข้อความ
            </div>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-surface-container text-on-surface-variant mt-1">{messages.length}</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 p-4">
            {loading ? (
              <div className="py-8 text-center text-sm text-on-surface-variant">กำลังโหลดข้อความ...</div>
            ) : messages.length === 0 ? (
              <div className="py-8 text-center text-sm text-on-surface-variant">ยังไม่มีข้อความ</div>
            ) : (
              messages.map((msg) => {
                const isOutbound = msg.direction === 'OUTGOING';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                        isOutbound
                          ? 'rounded-tr-sm bg-primary text-on-primary'
                          : 'rounded-tl-sm border border-outline-variant bg-surface-container text-on-surface'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          isOutbound ? 'text-on-primary/60' : 'text-on-surface-variant'
                        }`}
                      >
                        <ClientOnly fallback="-">{new Date(msg.sentAt).toLocaleString('th-TH')}</ClientOnly>
                        {msg.sender ? ` · ${msg.sender}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Reply box */}
          <div className="border-t border-outline-variant p-4">
            {sendError ? (
              <div className="mb-2 text-xs text-error">{sendError}</div>
            ) : null}
            <form onSubmit={(e) => void sendReply(e)} className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="พิมพ์ตอบ..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={sending}
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors"
                disabled={sending || !replyText.trim()}
              >
                <Send className="h-4 w-4" />
                {sending ? 'กำลังส่ง...' : 'ส่ง'}
              </button>
            </form>
          </div>
        </section>

        {/* Sidebar info */}
        <div className="space-y-4">
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10">
            <div className="px-5 py-4 border-b border-outline-variant">
              <div className="text-sm font-semibold text-primary">ผู้เช่า</div>
            </div>
            <div className="p-4 space-y-3">
              {loading ? (
                <div className="text-sm text-on-surface-variant">กำลังโหลด...</div>
              ) : conversation?.tenant ? (
                <>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-on-surface-variant" />
                    <span className="text-sm font-medium text-on-surface">
                      {conversation.tenant.fullName}
                    </span>
                  </div>
                  <div className="text-sm text-on-surface-variant">{conversation.tenant.phone}</div>
                  <Link
                    href={`/admin/tenants/${conversation.tenant.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container w-full text-center"
                  >
                    ดูโปรไฟล์ผู้เช่า →
                  </Link>
                </>
              ) : (
                <div className="text-sm text-on-surface-variant">
                  LINE User: {conversation?.lineUserId ?? '-'}
                  <p className="mt-1 text-xs">ไม่มีผู้เช่าที่ลิงก์กับบัญชี LINE นี้</p>
                </div>
              )}
            </div>
          </section>

          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10">
            <div className="px-5 py-4 border-b border-outline-variant">
              <div className="text-sm font-semibold text-primary">การสนทนา</div>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">สถานะ</span>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-surface-container text-on-surface-variant">{conversation?.status ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">เริ่มต้น</span>
                <span className="text-on-surface">
                  {conversation ? <ClientOnly fallback="-">{new Date(conversation.createdAt).toLocaleDateString('th-TH')}</ClientOnly> : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">กิจกรรมล่าสุด</span>
                <span className="text-on-surface">
                  {conversation ? <ClientOnly fallback="-">{new Date(conversation.updatedAt).toLocaleDateString('th-TH')}</ClientOnly> : '-'}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
