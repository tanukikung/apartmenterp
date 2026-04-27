'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ArrowLeft, Send, User, MessageSquare, X, Loader2, AlertCircle } from 'lucide-react';

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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalText, setModalText] = useState('');
  const [modalSending, setModalSending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
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

  async function sendModalMessage() {
    const text = modalText.trim();
    if (!text) return;
    setModalSending(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ส่งไม่ได้');
      setModalText('');
      setModalOpen(false);
      await load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'ส่งไม่ได้');
    } finally {
      setModalSending(false);
    }
  }

  const tenantName = conversation?.tenant?.fullName ?? conversation?.lineUserId ?? 'ไม่ทราบ';

  return (
    <main className="space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-[hsl(var(--color-border))]5 bg-[hsl(var(--color-surface))] backdrop-blur-[var(--glass-blur)] px-6 py-5 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(217,100%,67%,0.1)] to-transparent pointer-events-none" />
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[hsl(217,100%,67%,0.06)] blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <Link
            href="/admin/chat"
            className="flex items-center gap-1 text-sm font-medium text-[hsl(var(--card-foreground))]/50 hover:text-[hsl(var(--card-foreground))] transition-colors active:scale-[0.98]"
          >
            <ArrowLeft className="h-4 w-4" /> แชท
          </Link>
          <span className="text-[hsl(var(--card-foreground))]/20">/</span>
          <div className="flex-1">
            <h1 className="font-display text-xl font-semibold tracking-tight text-[hsl(var(--card-foreground))]">{tenantName}</h1>
            <p className="text-xs text-[hsl(var(--card-foreground))]/50 mt-0.5">
              {conversation ? `การสนทนา · ${conversation.status}` : 'กำลังโหลดการสนทนา...'}
            </p>
          </div>
          {conversation?.lineUserId && (
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[hsl(var(--color-border))]10 bg-[hsl(217,100%,67%,0.1)] px-4 py-2 text-xs font-semibold text-[hsl(217,100%,90%)] shadow-[var(--glow-primary)] transition-all hover:border-[hsl(217,100%,67%,0.3)] hover:bg-[hsl(217,100%,67%,0.15)] hover:shadow-[var(--glow-primary-hover)] active:scale-[0.98]"
            >
              <Send size={12} /> ส่งข้อความ
            </button>
          )}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-[hsl(0,72%,55%,0.3)] bg-[hsl(0,72%,55%,0.1)] px-4 py-3 text-sm text-[hsl(0,72%,90%)] backdrop-blur-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Chat layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Message thread */}
        <section className="rounded-2xl border border-[hsl(var(--color-border))]5 bg-[hsl(var(--color-surface))] backdrop-blur-[var(--glass-blur)] shadow-[0_4px_16px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden transition-all hover:border-white/10">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--color-border))]10 bg-[hsl(217,100%,67%,0.1)] shadow-[var(--glow-primary)]">
                <MessageSquare className="h-4 w-4 text-[hsl(217,100%,67%)]" />
              </div>
              <span className="text-sm font-semibold text-[hsl(var(--card-foreground))]/80">ข้อความ</span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border))]10 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--card-foreground))]/50 backdrop-blur-sm">{messages.length}</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 p-4">
            {loading ? (
              <div className="py-8 text-center text-sm text-[hsl(var(--card-foreground))]/30">กำลังโหลดข้อความ...</div>
            ) : messages.length === 0 ? (
              <div className="py-8 text-center text-sm text-[hsl(var(--card-foreground))]/30">ยังไม่มีข้อความ</div>
            ) : (
              messages.map((msg) => {
                const isOutbound = msg.direction === 'OUTGOING';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} animate-fade-in`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)] ${
                        isOutbound
                          ? 'rounded-tr-sm bg-gradient-to-br from-[hsl(217,100%,67%)] to-[hsl(217,100%,55%)] text-[hsl(var(--card-foreground))] shadow-[0_4px_20px_rgba(99,102,241,0.3)]'
                          : 'rounded-tl-sm border border-[hsl(var(--color-border))]10 bg-white/5 text-[hsl(var(--card-foreground))]/90 backdrop-blur-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      <p
                        className={`mt-1.5 text-[10px] ${
                          isOutbound ? 'text-[hsl(var(--card-foreground))]/60' : 'text-[hsl(var(--card-foreground))]/30'
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
          <div className="border-t border-white/5 p-4">
            {sendError ? (
              <div className="mb-2 text-xs text-[hsl(0,72%,90%)] bg-[hsl(0,72%,55%,0.1)] border border-[hsl(0,72%,55%,0.2)] rounded-lg px-3 py-2">{sendError}</div>
            ) : null}
            <form onSubmit={(e) => void sendReply(e)} className="flex gap-2">
              <input
                className="flex-1 rounded-xl border border-[hsl(var(--color-border))]10 bg-white/5 px-4 py-3 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--card-foreground))]/25 backdrop-blur-sm focus:border-[hsl(217,100%,67%,0.5)] focus:outline-none focus:ring-2 focus:ring-[hsl(217,100%,67%,0.2)] focus:bg-white/8 transition-all"
                placeholder="พิมพ์ตอบ..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={sending}
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))]10 bg-[hsl(217,100%,67%,0.1)] px-5 py-3 text-sm font-semibold text-[hsl(217,100%,90%)] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:border-[hsl(217,100%,67%,0.3)] hover:bg-[hsl(217,100%,67%,0.2)] hover:shadow-[var(--glow-primary-hover)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
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
          <section className="rounded-2xl border border-[hsl(var(--color-border))]5 bg-[hsl(var(--color-surface))] backdrop-blur-[var(--glass-blur)] shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden transition-all hover:border-white/10">
            <div className="px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--color-border))]10 bg-[hsl(217,100%,67%,0.1)]">
                  <User className="h-4 w-4 text-[hsl(217,100%,67%)]" />
                </div>
                <span className="text-sm font-semibold text-[hsl(var(--card-foreground))]/80">ผู้เช่า</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {loading ? (
                <div className="text-sm text-[hsl(var(--card-foreground))]/30">กำลังโหลด...</div>
              ) : conversation?.tenant ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[hsl(var(--card-foreground))]/90">{conversation.tenant.fullName}</span>
                  </div>
                  <div className="text-sm text-[hsl(var(--card-foreground))]/40">{conversation.tenant.phone}</div>
                  <Link
                    href={`/admin/tenants/${conversation.tenant.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--color-border))]10 bg-white/5 px-4 py-2.5 text-xs font-medium text-[hsl(var(--card-foreground))]/70 shadow-sm backdrop-blur-sm transition-all hover:border-white/20 hover:text-[hsl(var(--card-foreground))]/90 hover:bg-white/10 active:scale-[0.98] w-full text-center"
                  >
                    ดูโปรไฟล์ผู้เช่า →
                  </Link>
                </>
              ) : (
                <div className="text-sm text-[hsl(var(--card-foreground))]/30">
                  LINE User: {conversation?.lineUserId ?? '-'}
                  <p className="mt-1 text-xs text-[hsl(var(--card-foreground))]/20">ไม่มีผู้เช่าที่ลิงก์กับบัญชี LINE นี้</p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[hsl(var(--color-border))]5 bg-[hsl(var(--color-surface))] backdrop-blur-[var(--glass-blur)] shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden transition-all hover:border-white/10">
            <div className="px-5 py-4 border-b border-white/5">
              <span className="text-sm font-semibold text-[hsl(var(--card-foreground))]/80">การสนทนา</span>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-[hsl(var(--card-foreground))]/30">สถานะ</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border))]10 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--card-foreground))]/50 backdrop-blur-sm">{conversation?.status ?? '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[hsl(var(--card-foreground))]/30">เริ่มต้น</span>
                <span className="text-[hsl(var(--card-foreground))]/60">
                  {conversation ? <ClientOnly fallback="-">{new Date(conversation.createdAt).toLocaleDateString('th-TH')}</ClientOnly> : '-'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[hsl(var(--card-foreground))]/30">กิจกรรมล่าสุด</span>
                <span className="text-[hsl(var(--card-foreground))]/60">
                  {conversation ? <ClientOnly fallback="-">{new Date(conversation.updatedAt).toLocaleDateString('th-TH')}</ClientOnly> : '-'}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Send Message Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="rounded-2xl border border-[hsl(var(--color-border))]10 bg-[hsl(var(--color-surface))] backdrop-blur-[var(--glass-blur)] shadow-[0_4px_16px_rgba(0,0,0,0.08)] w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-[hsl(var(--card-foreground))]">ส่งข้อความ</h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-[hsl(var(--card-foreground))]/30 hover:text-[hsl(var(--card-foreground))] hover:bg-white/5 transition-all active:scale-[0.98]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {modalError && (
                <div className="text-xs text-[hsl(0,72%,90%)] bg-[hsl(0,72%,55%,0.1)] border border-[hsl(0,72%,55%,0.2)] rounded-xl px-3 py-2">
                  {modalError}
                </div>
              )}
              <textarea
                autoFocus
                value={modalText}
                onChange={(e) => setModalText(e.target.value)}
                placeholder="พิมพ์ข้อความที่ต้องการส่ง..."
                rows={5}
                className="w-full resize-none rounded-xl border border-[hsl(var(--color-border))]10 bg-white/5 px-4 py-3 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--card-foreground))]/25 backdrop-blur-sm focus:border-[hsl(217,100%,67%,0.5)] focus:outline-none focus:ring-2 focus:ring-[hsl(217,100%,67%,0.2)] transition-all"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  disabled={modalSending}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[hsl(var(--color-border))]10 bg-white/5 px-4 py-2.5 text-sm font-medium text-[hsl(var(--card-foreground))]/60 backdrop-blur-sm transition-all hover:border-white/20 hover:text-[hsl(var(--card-foreground))]/80 hover:bg-white/10 active:scale-[0.98] disabled:opacity-40"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => void sendModalMessage()}
                  disabled={modalSending || !modalText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(217,100%,67%,0.1)] border border-[hsl(217,100%,67%,0.2)] px-5 py-2.5 text-sm font-semibold text-[hsl(217,100%,90%)] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:border-[hsl(217,100%,67%,0.4)] hover:bg-[hsl(217,100%,67%,0.2)] hover:shadow-[var(--glow-primary-hover)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {modalSending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />กำลังส่ง...</>
                  ) : (
                    <><Send className="h-4 w-4" />ส่ง</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
