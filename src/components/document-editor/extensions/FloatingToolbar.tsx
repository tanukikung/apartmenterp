'use client';

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Highlighter,
  Italic,
  Underline as UnderlineIcon,
  Type,
} from 'lucide-react';

const FONT_FAMILIES = [
  { label: 'Segoe UI', value: '"Segoe UI", "Inter", system-ui, sans-serif' },
  { label: 'Sarabun', value: '"Sarabun", "Segoe UI", system-ui, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Tahoma', value: 'Tahoma, "Segoe UI", sans-serif' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
];

const FONT_SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 48, 72];

function getCurrentFontFamily(editor: Editor): string {
  const ff = editor.getAttributes('textStyle').fontFamily as string | undefined;
  if (!ff) return 'Segoe UI';
  const match = FONT_FAMILIES.find((f) => f.value === ff);
  return match ? match.label : ff.split(',')[0].replace(/"/g, '');
}

function getCurrentFontSize(editor: Editor): string {
  const fs = editor.getAttributes('textStyle').fontSize as string | undefined;
  return fs ? fs.replace('px', '') : '16';
}

/* ── Font Family Picker ── */
export function FontFamilyPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getCurrentFontFamily(editor);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="word-color-group" ref={ref}>
      <button
        type="button"
        className="word-font-picker-btn"
        style={{ fontFamily: editor.getAttributes('textStyle').fontFamily || 'inherit' }}
        onClick={() => setOpen((v) => !v)}
      >
        <Type className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" />
        <span className="word-font-picker-name">{current}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-on-surface-variant" />
      </button>
      {open && (
        <div className="word-font-picker-dropdown">
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.label}
              type="button"
              className={`word-font-picker-option ${current === f.label ? 'active' : ''}`}
              style={{ fontFamily: f.value }}
              onClick={() => {
                editor.chain().focus().setFontFamily(f.value).run();
                setOpen(false);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Font Size Picker ── */
export function FontSizePicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getCurrentFontSize(editor);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="word-color-group" ref={ref}>
      <button
        type="button"
        className="word-font-picker-btn"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="word-font-size-value">{current}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-on-surface-variant" />
      </button>
      {open && (
        <div className="word-font-picker-dropdown">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className={`word-font-picker-option ${current === String(size) ? 'active' : ''}`}
              onClick={() => {
                editor.chain().focus().setFontSize(`${size}px`).run();
                setOpen(false);
              }}
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TEXT_COLORS = ['#0f172a', '#4338ca', '#0f766e', '#b45309', '#be123c'];
const HIGHLIGHT_COLORS = ['#fef08a', '#bfdbfe', '#fecdd3', '#bbf7d0', '#fde68a'];

type Props = {
  editor: Editor;
};

export function FloatingToolbar({ editor }: Props) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function updateToolbar() {
      const { from, to } = editor.state.selection;
      if (from === to) {
        setVisible(false);
        return;
      }

      // Get the DOM position of the selection
      const domSelection = window.getSelection();
      if (!domSelection || domSelection.rangeCount === 0) {
        setVisible(false);
        return;
      }

      const range = domSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Don't show if selection is in a table cell (let TableToolbar handle it)
      const ancestor = range.commonAncestorContainer;
      const inTable = ancestor instanceof HTMLElement && ancestor.closest('td, th');
      if (inTable) {
        setVisible(false);
        return;
      }

      const toolbarWidth = 360;
      const toolbarHeight = 44;
      const padding = 8;

      let left = rect.left + rect.width / 2 - toolbarWidth / 2;
      left = Math.max(padding, Math.min(left, window.innerWidth - toolbarWidth - padding));

      const top = rect.top - toolbarHeight - padding + window.scrollY;

      setPosition({ top, left });
      setVisible(true);
    }

    editor.on('selectionUpdate', updateToolbar);
    editor.on('blur', () => setVisible(false));
    return () => {
      editor.off('selectionUpdate', updateToolbar);
    };
  }, [editor]);

  if (!visible) return null;

  return (
    <div
      ref={toolbarRef}
      className="floating-toolbar"
      style={{ top: position.top, left: position.left }}
    >
      {/* Text style */}
      <button
        type="button"
        className={`floating-toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
        title="ตัวหนา (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`floating-toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
        title="ตัวเอียง (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`floating-toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
        title="ขีดเส้นใต้ (Ctrl+U)"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </button>

      <div className="floating-toolbar-divider" />

      {/* Alignment */}
      <button
        type="button"
        className={`floating-toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('left').run(); }}
        title="จัดซ้าย"
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`floating-toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('center').run(); }}
        title="จัดกลาง"
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`floating-toolbar-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('right').run(); }}
        title="จัดขวา"
      >
        <AlignRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={`floating-toolbar-btn ${editor.isActive({ textAlign: 'justify' }) ? 'active' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setTextAlign('justify').run(); }}
        title="จัดเต็มบรรทัด"
      >
        <AlignJustify className="h-3.5 w-3.5" />
      </button>

      <div className="floating-toolbar-divider" />

      {/* Text color */}
      <div className="floating-toolbar-relative">
        <button
          type="button"
          className="floating-toolbar-btn"
          onClick={() => { setShowColorPicker((v) => !v); setShowHighlightPicker(false); }}
          title="สีตัวอักษร"
        >
          <span className="floating-toolbar-color-dot" style={{ background: editor.getAttributes('textStyle').color || '#0f172a' }} />
        </button>
        {showColorPicker && (
          <div className="floating-toolbar-picker">
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="floating-toolbar-color-swatch"
                style={{ background: color }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().setColor(color).run();
                  setShowColorPicker(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Highlight color */}
      <div className="floating-toolbar-relative">
        <button
          type="button"
          className="floating-toolbar-btn"
          onClick={() => { setShowHighlightPicker((v) => !v); setShowColorPicker(false); }}
          title="ไฮไลท์"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </button>
        {showHighlightPicker && (
          <div className="floating-toolbar-picker">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="floating-toolbar-color-swatch"
                style={{ background: color }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().toggleHighlight({ color }).run();
                  setShowHighlightPicker(false);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
