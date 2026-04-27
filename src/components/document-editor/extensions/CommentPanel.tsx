'use client';

import { useEffect, useState } from 'react';
import { Check, RefreshCw, Send, Trash2, X } from 'lucide-react';
import type { Editor } from '@tiptap/react';

type Comment = {
  id: string;
  templateId: string;
  versionId: string | null;
  anchorText: string;
  content: string;
  authorId: string;
  authorName: string;
  resolved: boolean;
  createdAt: string;
};

type Props = {
  templateId: string;
  versionId?: string;
  editor?: Editor | null;
  onClose?: () => void;
};

export function CommentPanel({ templateId, versionId, editor, onClose }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedAnchor, setSelectedAnchor] = useState('');

  // Refresh comments from API
  async function loadComments() {
    setLoading(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/comments`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setComments(json.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadComments();
  }, [templateId]);

  // Get selected text from editor when panel opens
  useEffect(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from !== to) {
      const text = editor.state.doc.textBetween(from, to, ' ');
      setSelectedAnchor(text.slice(0, 100));
    }
  }, [editor]);

  async function handleAddComment() {
    if (!newContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorText: selectedAnchor, content: newContent.trim(), versionId }),
      });
      const json = await res.json();
      if (json.success) {
        setComments((prev) => [...prev, json.data]);
        setNewContent('');
        setSelectedAnchor('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(commentId: string, resolved: boolean) {
    await fetch(`/api/templates/${templateId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    });
    setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, resolved } : c));
  }

  async function handleDelete(commentId: string) {
    if (!confirm('ลบความเห็นนี้?')) return;
    await fetch(`/api/templates/${templateId}/comments/${commentId}`, { method: 'DELETE' });
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  const openComments = comments.filter((c) => !c.resolved);
  const resolvedComments = comments.filter((c) => c.resolved);

  return (
    <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-on-surface">ความเห็น</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {openComments.length > 0 ? `${openComments.length} ความเห็นที่ยังไม่ได้แก้` : 'ไม่มีความเห็น'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadComments()}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
            title="รีเฟรช"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Add comment form */}
      <div className="p-4 border-b border-outline-variant">
        {selectedAnchor && (
          <div className="mb-2 rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
            <span className="font-medium text-on-surface">อ้างอิง: </span>
            <span className="line-clamp-2">{selectedAnchor}</span>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="เพิ่มความเห็น..."
            rows={2}
            className="flex-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                void handleAddComment();
              }
            }}
          />
          <div className="flex flex-col justify-end">
            <button
              type="button"
              onClick={() => void handleAddComment()}
              disabled={!newContent.trim() || submitting}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
        {selectedAnchor && (
          <p className="mt-1.5 text-[10px] text-on-surface-variant">
            กด <kbd className="rounded bg-surface-container px-1 py-0.5 font-mono">Ctrl+Enter</kbd> เพื่อส่ง
          </p>
        )}
      </div>

      {/* Comments list */}
      <div className="overflow-y-auto max-h-[500px]">
        {loading ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">กำลังโหลด...</div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center text-sm text-on-surface-variant">ยังไม่มีความเห็น</div>
        ) : (
          <div className="divide-y divide-outline-variant">
            {openComments.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-surface-container-lowest">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    ความเห็นที่ยังเปิด ({openComments.length})
                  </span>
                </div>
                {openComments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    onResolve={(resolved) => void handleResolve(comment.id, resolved)}
                    onDelete={() => void handleDelete(comment.id)}
                  />
                ))}
              </div>
            )}

            {resolvedComments.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-surface-container-lowest flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-outline-variant">
                    ความเห็นที่แก้แล้ว ({resolvedComments.length})
                  </span>
                </div>
                {resolvedComments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    onResolve={(resolved) => void handleResolve(comment.id, resolved)}
                    onDelete={() => void handleDelete(comment.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CommentItem({ comment, onResolve, onDelete }: {
  comment: Comment;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`px-4 py-3 ${comment.resolved ? 'opacity-60' : ''}`}>
      {comment.anchorText && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-left w-full mb-1.5"
        >
          <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            {`&quot;${comment.anchorText.length > 60 ? comment.anchorText.slice(0, 60) + '...' : comment.anchorText}&quot;`}
          </span>
        </button>
      )}
      <div className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{comment.content}</div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-on-surface-variant">{comment.authorName}</span>
          <span className="text-[10px] text-on-surface-variant">
            • {new Date(comment.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {comment.resolved ? (
            <button
              type="button"
              onClick={() => onResolve(false)}
              className="flex h-6 w-6 items-center justify-center rounded text-on-warning-container hover:bg-warning-container/20 transition-colors"
              title="เปิดความเห็นใหม่"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onResolve(true)}
              className="flex h-6 w-6 items-center justify-center rounded text-on-success-container hover:bg-success-container/20 transition-colors"
              title="ทำเป็นแก้แล้ว"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="flex h-6 w-6 items-center justify-center rounded text-on-error-container hover:bg-error-container/20 transition-colors"
            title="ลบความเห็น"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}