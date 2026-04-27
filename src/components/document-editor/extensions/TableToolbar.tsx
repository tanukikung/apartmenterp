'use client';

import type { Editor } from '@tiptap/react';

type Props = {
  activeEditor: Editor | null;
};

export function TableToolbar({ activeEditor }: Props) {
  if (!activeEditor || !activeEditor.isActive('table')) return null;

  return (
    <div className="flex items-center gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest px-2 py-1.5 shadow-lg">
      <button
        type="button"
        onClick={() => activeEditor.chain().focus().addColumnBefore().run()}
        className="table-toolbar-btn"
        title="เพิ่มคอลัมน์ซ้าย"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <rect x="1" y="3" width="5" height="10" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="7" y="3" width="8" height="10" rx="1" fill="currentColor" />
          <path d="M6 8h1M9 8h1" stroke="white" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => activeEditor.chain().focus().addColumnAfter().run()}
        className="table-toolbar-btn"
        title="เพิ่มคอลัมน์ขวา"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <rect x="1" y="3" width="8" height="10" rx="1" fill="currentColor" />
          <rect x="10" y="3" width="5" height="10" rx="1" fill="currentColor" opacity="0.3" />
          <path d="M6 8h1M9 8h1" stroke="white" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => activeEditor.chain().focus().deleteColumn().run()}
        className="table-toolbar-btn text-red-500"
        title="ลบคอลัมน์"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <rect x="1" y="3" width="14" height="10" rx="1" fill="currentColor" opacity="0.15" />
          <path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <div className="mx-1 h-5 w-px bg-outline-variant" />
      <button
        type="button"
        onClick={() => activeEditor.chain().focus().addRowBefore().run()}
        className="table-toolbar-btn"
        title="เพิ่มแถวข้างบน"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <rect x="3" y="1" width="10" height="5" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="3" y="7" width="10" height="8" rx="1" fill="currentColor" />
          <path d="M8 6v1M8 9v1" stroke="white" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => activeEditor.chain().focus().addRowAfter().run()}
        className="table-toolbar-btn"
        title="เพิ่มแถวข้างล่าง"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <rect x="3" y="1" width="10" height="8" rx="1" fill="currentColor" />
          <rect x="3" y="10" width="10" height="5" rx="1" fill="currentColor" opacity="0.3" />
          <path d="M8 6v1M8 9v1" stroke="white" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => activeEditor.chain().focus().deleteRow().run()}
        className="table-toolbar-btn text-red-500"
        title="ลบแถว"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <rect x="3" y="1" width="10" height="14" rx="1" fill="currentColor" opacity="0.15" />
          <path d="M3 6h10M3 10h10" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <div className="mx-1 h-5 w-px bg-outline-variant" />
      <button
        type="button"
        onClick={() => activeEditor.chain().focus().mergeCells().run()}
        className="table-toolbar-btn"
        title="รวมช่อง"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
          <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.4" />
          <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.4" />
          <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => activeEditor.chain().focus().splitCell().run()}
        className="table-toolbar-btn"
        title="แยกช่อง"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <rect x="1" y="1" width="14" height="14" rx="1" fill="currentColor" opacity="0.2" />
          <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
          <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
        </svg>
      </button>
      <div className="mx-1 h-5 w-px bg-outline-variant" />
      <button
        type="button"
        onClick={() => activeEditor.chain().focus().deleteTable().run()}
        className="table-toolbar-btn text-red-500"
        title="ลบตาราง"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <path d="M3 3h10l-1 10H4L3 3z" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M1 3h14" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 3v10M5 8h6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
}
