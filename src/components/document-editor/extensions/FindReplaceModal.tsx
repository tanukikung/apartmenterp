'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

type Props = {
  activeEditor: import('@tiptap/react').Editor | null;
};

export function FindReplaceModal({ activeEditor }: Props) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matches, setMatches] = useState<{ from: number; to: number }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when modal opens
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    setFind('');
    setReplace('');
    setMatches([]);
    setCurrentIndex(0);
    activeEditor?.chain().focus().unsetHighlight().run();
  }, [open, activeEditor]);

  // Build search regex safely
  function getRegex(query: string): RegExp | null {
    try {
      return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    } catch {
      return null;
    }
  }

  function searchAll(query: string) {
    if (!activeEditor || !query) {
      setMatches([]);
      setCurrentIndex(0);
      return;
    }
    const regex = getRegex(query);
    if (!regex) return;

    const text = activeEditor.state.doc.textBetween(0, activeEditor.state.doc.content.size, '\n');
    const results: { from: number; to: number }[] = [];
    let pos = 0;
    let m: RegExpExecArray | null;

    while ((m = regex.exec(text)) !== null) {
      results.push({ from: pos + m.index, to: pos + m.index + m[0].length });
      pos += m.index + m[0].length;
      regex.lastIndex = 0;
    }

    setMatches(results);
    setCurrentIndex(0);

    if (results.length > 0) {
      const target = results[0];
      activeEditor.chain().focus().setTextSelection(target).run();
    } else {
      activeEditor.chain().focus().unsetHighlight().run();
    }
  }

  function navigatePrev() {
    if (matches.length === 0) return;
    const idx = Math.max(0, currentIndex - 1);
    setCurrentIndex(idx);
    activeEditor?.chain().focus().setTextSelection(matches[idx]).run();
  }

  function navigateNext() {
    if (matches.length === 0) return;
    const idx = Math.min(matches.length - 1, currentIndex + 1);
    setCurrentIndex(idx);
    activeEditor?.chain().focus().setTextSelection(matches[idx]).run();
  }

  function replaceOne() {
    if (!activeEditor || matches.length === 0) return;
    const { from, to } = activeEditor.state.selection;
    if (from === to) return;
    activeEditor.chain().focus().deleteSelection().insertContent(replace).run();
    searchAll(find);
  }

  function replaceAll() {
    if (!activeEditor || matches.length === 0) return;
    // Work backwards so positions stay valid
    for (let i = matches.length - 1; i >= 0; i--) {
      const { from, to } = matches[i];
      activeEditor.chain().focus().setTextSelection({ from, to }).run();
      activeEditor.chain().focus().deleteSelection().insertContent(replace).run();
    }
    activeEditor.chain().focus().unsetHighlight().run();
    setMatches([]);
    setCurrentIndex(0);
  }

  function close() {
    activeEditor?.chain().focus().unsetHighlight().run();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
        title="ค้นหา / Find (Ctrl+F)"
      >
        <Search className="h-3.5 w-3.5" />
        ค้นหา
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      <div className="absolute inset-0 bg-black/30" onClick={close} />
      <div className="relative w-full max-w-lg rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-3">
          <span className="text-sm font-semibold text-on-surface">ค้นหาและแทนที่</span>
          <button type="button" onClick={close} className="rounded-lg p-1 hover:bg-surface-container">
            <X className="h-4 w-4 text-on-surface-variant" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          {/* Find row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-surface-variant" />
              <input
                ref={inputRef}
                type="text"
                value={find}
                onChange={(e) => {
                  setFind(e.target.value);
                  searchAll(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigateNext();
                  if (e.key === 'Escape') close();
                }}
                placeholder="พิมพ์ข้อความที่ต้องการค้นหา..."
                className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 pl-9 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant"
              />
            </div>
            {/* Navigation arrows */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={navigatePrev}
                disabled={matches.length === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                title="ไปข้อความก่อนหน้า"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button
                type="button"
                onClick={navigateNext}
                disabled={matches.length === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                title="ไปข้อความถัดไป"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5"><path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            {find ? (
              <span className="min-w-[60px] text-center text-xs font-medium text-on-surface-variant">
                {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : 'ไม่พบ'}
              </span>
            ) : null}
          </div>

          {/* Replace row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') replaceOne();
                if (e.key === 'Escape') close();
              }}
              placeholder="แทนที่ด้วย..."
              className="flex-1 rounded-lg border border-outline bg-surface-container-lowest py-2 px-3 text-sm text-on-surface placeholder:text-on-surface-variant"
            />
            <button
              type="button"
              onClick={replaceOne}
              disabled={matches.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40"
            >
              แทนที่
            </button>
            <button
              type="button"
              onClick={() => replaceAll()}
              disabled={matches.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40"
            >
              ทั้งหมด
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
