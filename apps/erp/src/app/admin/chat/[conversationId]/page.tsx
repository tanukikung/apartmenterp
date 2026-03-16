'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, User, MessageSquare } from 'lucide-react';

type Message = {
  id: string;
  content: string;
  direction: 'INBOUND' | 'OUTBOUND';
  createdAt: string;
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
      if (!res.success) throw new Error(res.error?.message || 'Unable to load conversation');
      const conv: Conversation = res.data;
      setConversation(conv);
      setMessages(conv.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load conversation');
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
        body: JSON.stringify({ content: text }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to send message');
      setReplyText('');
      await load();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Unable to send message');
    } finally {
      setSending(false);
    }
  }

  const tenantName = conversation?.tenant?.fullName ?? conversation?.lineUserId ?? 'Unknown';

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/chat"
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Chat
          </Link>
          <span className="text-slate-300">/</span>
          <div>
            <h1 className="admin-page-title">{tenantName}</h1>
            <p className="admin-page-subtitle">
              {conversation ? `Conversation · ${conversation.status}` : 'Loading conversation...'}
            </p>
          </div>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {/* Chat layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Message thread */}
        <section className="admin-card flex flex-col overflow-hidden" style={{ minHeight: '60vh' }}>
          <div className="admin-card-header">
            <div className="admin-card-title flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-indigo-500" />
              Messages
            </div>
            <span className="admin-badge">{messages.length}</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 p-4">
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-500">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">No messages yet.</div>
            ) : (
              messages.map((msg) => {
                const isOutbound = msg.direction === 'OUTBOUND';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                        isOutbound
                          ? 'rounded-tr-sm bg-indigo-600 text-white'
                          : 'rounded-tl-sm border border-slate-200 bg-white text-slate-800'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          isOutbound ? 'text-indigo-200' : 'text-slate-400'
                        }`}
                      >
                        {new Date(msg.createdAt).toLocaleString()}
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
          <div className="border-t border-slate-100 p-4">
            {sendError ? (
              <div className="mb-2 text-xs text-red-600">{sendError}</div>
            ) : null}
            <form onSubmit={(e) => void sendReply(e)} className="flex gap-2">
              <input
                className="admin-input flex-1"
                placeholder="Type a reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={sending}
              />
              <button
                type="submit"
                className="admin-button admin-button-primary flex items-center gap-1"
                disabled={sending || !replyText.trim()}
              >
                <Send className="h-4 w-4" />
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        </section>

        {/* Sidebar info */}
        <div className="space-y-4">
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Tenant</div>
            </div>
            <div className="p-4 space-y-3">
              {loading ? (
                <div className="text-sm text-slate-500">Loading...</div>
              ) : conversation?.tenant ? (
                <>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-900">
                      {conversation.tenant.fullName}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500">{conversation.tenant.phone}</div>
                  <Link
                    href={`/admin/tenants/${conversation.tenant.id}`}
                    className="admin-button w-full text-center text-xs"
                  >
                    View Tenant Profile →
                  </Link>
                </>
              ) : (
                <div className="text-sm text-slate-500">
                  LINE User: {conversation?.lineUserId ?? '-'}
                  <p className="mt-1 text-xs">No tenant linked to this LINE account.</p>
                </div>
              )}
            </div>
          </section>

          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Conversation</div>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="admin-badge">{conversation?.status ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Started</span>
                <span className="text-slate-700">
                  {conversation ? new Date(conversation.createdAt).toLocaleDateString() : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last activity</span>
                <span className="text-slate-700">
                  {conversation ? new Date(conversation.updatedAt).toLocaleDateString() : '-'}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
