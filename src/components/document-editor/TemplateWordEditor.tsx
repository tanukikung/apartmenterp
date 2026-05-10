'use client';

import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';

const MARGIN_PRESET_MM: Record<string, number> = { narrow: 14, wide: 24, normal: 18 };
const MARGIN_TOP_BOTTOM_MM: Record<string, number> = { narrow: 12, wide: 22, normal: 18 };
const FONT_FAMILY_MAP: Record<string, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sarabun: '"Sarabun", "Segoe UI", system-ui, sans-serif',
  sans: '"Segoe UI", "Inter", system-ui, sans-serif',
};
const FONT_SIZE_MAP: Record<string, string> = { sm: '14px', base: '15px', lg: '17px' };
const LINE_HEIGHT_MAP: Record<string, string> = { normal: '1.5', relaxed: '1.75', loose: '2' };
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  Bold,
  Columns3,
  Eye,
  FileDown,
  Highlighter,
  ImagePlus,
  Indent,
  Italic,
  Link2,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Minus,
  Outdent,
  PaintBucket,
  Plus,
  Printer,
  Redo2,
  RemoveFormatting,
  Rows3,
  Settings2,
  SplitSquareVertical,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  applyTemplateVariables,
  documentTemplateHtmlToText,
  parseTemplateDocument,
  serializeTemplateDocument,
  type TemplateDocumentMeta,
  normalizeDocumentTemplateBody,
} from '@/lib/templates/document-template';
import { Columns } from './extensions/Columns';
import { LineSpacing } from './extensions/LineSpacing';
import { PageBreak } from './extensions/PageBreak';
import { ResizableImage } from './extensions/ResizableImage';
import { PageSetupModal } from './extensions/PageSetupModal';
import { BlockPalette } from './extensions/BlockPalette';
import { FindReplaceModal } from './extensions/FindReplaceModal';
import { FloatingToolbar, FontFamilyPicker, FontSizePicker } from './extensions/FloatingToolbar';

type TemplateWordEditorProps = {
  value: string;
  subject: string;
  previewValues: Record<string, string>;
  onChange: (html: string) => void;
  onUploadImage: (file: File) => Promise<{ url: string; name?: string }>;
  /** When set, the "Real Preview" button resolves DB data and renders with真实 values */
  templateId?: string;
  /** Exposes the TipTap editor instance so parent can insert content directly */
  editorRef?: React.MutableRefObject<import('@tiptap/react').Editor | null>;
};

type RegionKey = 'header' | 'body' | 'footer';

type PageMetrics = {
  pageWidth: string;
  pageMinHeight: string;
  pageWidthMm: number;
  marginX: string;
  marginXMm: number;
  marginTop: string;
  marginBottom: string;
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
};

const TEXT_COLORS = ['#0f172a', '#4338ca', '#0f766e', '#b45309', '#be123c'];
const HIGHLIGHT_COLORS = ['#fef08a', '#bfdbfe', '#fecdd3', '#bbf7d0', '#fde68a'];

function resolvePageMetrics(meta: TemplateDocumentMeta): PageMetrics {
  const PAGE_DIMS: Record<string, { w: number; h: number }> = {
    A5: { w: 148, h: 210 },
    A4: { w: 210, h: 297 },
    A3: { w: 297, h: 420 },
    LETTER: { w: 216, h: 279 },
    LEGAL: { w: 216, h: 356 },
    CUSTOM: { w: meta.customWidthMm ?? 210, h: meta.customHeightMm ?? 297 },
  };
  const dims = PAGE_DIMS[meta.pageSize] ?? PAGE_DIMS.A4;
  const isLandscape = meta.orientation === 'LANDSCAPE';
  const isCustomMargin = meta.marginPreset === 'custom';
  const marginXMm = isCustomMargin ? (meta.customMarginLeftMm ?? 18) : (MARGIN_PRESET_MM[meta.marginPreset ?? 'normal'] ?? 18);
  const marginTopMm = isCustomMargin ? (meta.customMarginTopMm ?? 18) : (MARGIN_TOP_BOTTOM_MM[meta.marginPreset ?? 'normal'] ?? 18);
  const marginBottomMm = isCustomMargin ? (meta.customMarginBottomMm ?? 18) : (MARGIN_TOP_BOTTOM_MM[meta.marginPreset ?? 'normal'] ?? 18);

  const pw = isLandscape ? dims.h : dims.w;
  const ph = isLandscape ? dims.w : dims.h;

  return {
    pageWidth: `${pw}mm`,
    pageMinHeight: `${ph}mm`,
    pageWidthMm: pw,
    marginX: `${marginXMm}mm`,
    marginXMm,
    marginTop: `${marginTopMm}mm`,
    marginBottom: `${marginBottomMm}mm`,
    fontFamily: FONT_FAMILY_MAP[meta.fontFamily] ?? '"Segoe UI", "Inter", system-ui, sans-serif',
    fontSize: FONT_SIZE_MAP[meta.fontSize] ?? '15px',
    lineHeight: LINE_HEIGHT_MAP[meta.lineHeight] ?? '1.75',
  };
}

function buildPageStyle(meta: TemplateDocumentMeta): CSSProperties {
  const metrics = resolvePageMetrics(meta);

  return {
    ['--word-page-width' as string]: metrics.pageWidth,
    ['--word-page-min-height' as string]: metrics.pageMinHeight,
    ['--word-page-padding-x' as string]: metrics.marginX,
    ['--word-page-padding-top' as string]: metrics.marginTop,
    ['--word-page-padding-bottom' as string]: metrics.marginBottom,
    ['--word-font-family' as string]: metrics.fontFamily,
    ['--word-font-size' as string]: metrics.fontSize,
    ['--word-line-height' as string]: metrics.lineHeight,
  };
}

function createWordExtensions(placeholder: string) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    TextStyle,
    FontFamily,
    Color,
    Highlight.configure({ multicolor: true }),
    Link.configure({ openOnClick: false, autolink: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    ResizableImage,
    PageBreak,
    Columns,
    LineSpacing,
  ];
}

function createRegionExtensions(placeholder: string) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, blockquote: false, codeBlock: false }),
    Underline,
    TextStyle,
    FontFamily,
    Color,
    Highlight.configure({ multicolor: true }),
    Link.configure({ openOnClick: false, autolink: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder }),
    ResizableImage,
    LineSpacing,
  ];
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function countDesignedPages(html: string): number {
  return (html.match(/data-page-break=["']true["']/g) ?? []).length + 1;
}

function buildRulerTicks(pageWidthMm: number): number[] {
  const ticks: number[] = [];
  for (let index = 0; index <= pageWidthMm; index += 10) {
    ticks.push(index);
  }
  if (ticks[ticks.length - 1] !== pageWidthMm) {
    ticks.push(pageWidthMm);
  }
  return ticks;
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`word-toolbar-button ${active ? 'word-toolbar-button-active' : ''}`}
      title={label}
    >
      {children}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function RegionButton({
  active,
  label,
  description,
  onClick,
}: {
  active: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`word-region-button ${active ? 'word-region-button-active' : ''}`}
    >
      <span className="word-region-button-label">{label}</span>
      <span className="word-region-button-copy">{description}</span>
    </button>
  );
}

export function TemplateWordEditor({
  value,
  subject: _subject,
  previewValues,
  onChange,
  onUploadImage,
  templateId,
  editorRef,
}: TemplateWordEditorProps) {
  const parsedDocument = useMemo(() => parseTemplateDocument(value), [value]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSerializedRef = useRef(serializeTemplateDocument(parsedDocument));
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [layout, setLayout] = useState<TemplateDocumentMeta>(parsedDocument.meta);
  const [previewZoom, setPreviewZoom] = useState(60); // percent
  const [showMarginGuides, setShowMarginGuides] = useState(true);
  const [headerHtml, setHeaderHtml] = useState(parsedDocument.headerHtml);
  const [footerHtml, setFooterHtml] = useState(parsedDocument.footerHtml);
  const [editorBody, setEditorBody] = useState(parsedDocument.bodyHtml);
  const [activeRegion, setActiveRegion] = useState<RegionKey>('body');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [puppeteerPreviewUrl, setPuppeteerPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showPageSetup, setShowPageSetup] = useState(false);
  const [, setShowFindReplace] = useState(false);
  const [undoToast, setUndoToast] = useState<string | null>(null);
  const [previewFlash, setPreviewFlash] = useState(false);
  const [_showHistory, _setShowHistory] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');

  async function generatePuppeteerPreview() {
    setIsGeneratingPreview(true);
    setPreviewError(null);
    try {
      const payload: Record<string, unknown> = {};

      if (templateId) {
        // Mode 1: Resolve real DB data (tenant name, room number, billing amounts, etc.)
        payload.templateId = templateId;
        // Defaults: first eligible room + current month/year
        const now = new Date();
        payload.year = now.getFullYear();
        payload.month = now.getMonth() + 1;
      } else {
        // Mode 2: Raw HTML quick preview (shows layout/CSS but placeholder values)
        payload.html = previewHtml;
      }

      const response = await fetch('/api/templates/preview-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error?.message ?? 'ไม่สามารถสร้างตัวอย่างเอกสาร');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPuppeteerPreviewUrl(objectUrl);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIsGeneratingPreview(false);
    }
  }

  function closePuppeteerPreview() {
    if (puppeteerPreviewUrl) {
      URL.revokeObjectURL(puppeteerPreviewUrl);
      setPuppeteerPreviewUrl(null);
    }
  }

  const headerEditor = useEditor({
    immediatelyRender: false,
    extensions: createRegionExtensions('Add a repeating header for every page...'),
    content: parsedDocument.headerHtml,
    onUpdate({ editor }) {
      setHeaderHtml(normalizeDocumentTemplateBody(editor.getHTML()));
    },
    onFocus() {
      setActiveRegion('header');
    },
    editorProps: {
      attributes: {
        class: 'word-editor-content word-editor-content-region word-editor-content-header',
        spellcheck: 'true',
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
          file.type.startsWith('image/'),
        );
        if (files.length === 0) return false;

        event.preventDefault();
        setActiveRegion('header');
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const insertPos = coords?.pos ?? view.state.selection.from;
        void uploadDroppedImages(headerEditor, files, insertPos);
        return true;
      },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
          file.type.startsWith('image/'),
        );
        if (files.length === 0) return false;

        event.preventDefault();
        setActiveRegion('header');
        void uploadDroppedImages(headerEditor, files, view.state.selection.from);
        return true;
      },
    },
  });

  const bodyEditor = useEditor({
    immediatelyRender: false,
    extensions: createWordExtensions('Start typing the main document here...'),
    content: parsedDocument.bodyHtml,
    onUpdate({ editor }) {
      setEditorBody(normalizeDocumentTemplateBody(editor.getHTML()));
    },
    onFocus() {
      setActiveRegion('body');
    },
    editorProps: {
      attributes: {
        class: 'word-editor-content word-editor-content-body',
        spellcheck: 'true',
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
          file.type.startsWith('image/'),
        );
        if (files.length === 0) return false;

        event.preventDefault();
        setActiveRegion('body');
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const insertPos = coords?.pos ?? view.state.selection.from;
        void uploadDroppedImages(bodyEditor, files, insertPos);
        return true;
      },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
          file.type.startsWith('image/'),
        );
        if (files.length === 0) return false;

        event.preventDefault();
        setActiveRegion('body');
        void uploadDroppedImages(bodyEditor, files, view.state.selection.from);
        return true;
      },
    },
  });

  const footerEditor = useEditor({
    immediatelyRender: false,
    extensions: createRegionExtensions('Add a repeating footer for every page...'),
    content: parsedDocument.footerHtml,
    onUpdate({ editor }) {
      setFooterHtml(normalizeDocumentTemplateBody(editor.getHTML()));
    },
    onFocus() {
      setActiveRegion('footer');
    },
    editorProps: {
      attributes: {
        class: 'word-editor-content word-editor-content-region word-editor-content-footer',
        spellcheck: 'true',
      },
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((file) =>
          file.type.startsWith('image/'),
        );
        if (files.length === 0) return false;

        event.preventDefault();
        setActiveRegion('footer');
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const insertPos = coords?.pos ?? view.state.selection.from;
        void uploadDroppedImages(footerEditor, files, insertPos);
        return true;
      },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
          file.type.startsWith('image/'),
        );
        if (files.length === 0) return false;

        event.preventDefault();
        setActiveRegion('footer');
        void uploadDroppedImages(footerEditor, files, view.state.selection.from);
        return true;
      },
    },
  });

  const activeEditor =
    activeRegion === 'header'
      ? headerEditor
      : activeRegion === 'footer'
        ? footerEditor
        : bodyEditor;

  // Expose body editor to parent via ref
  useEffect(() => {
    if (editorRef) {
      editorRef.current = bodyEditor;
    }
  }, [bodyEditor, editorRef]);

  // Ctrl+F opens Find & Replace
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFindReplace(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const previewHtml = useMemo(
    () =>
      applyTemplateVariables(
        serializeTemplateDocument({
          meta: layout,
          headerHtml,
          bodyHtml: editorBody,
          footerHtml,
        }),
        previewValues,
      ),
    [editorBody, footerHtml, headerHtml, layout, previewValues],
  );

  const previewDocument = useMemo(() => parseTemplateDocument(previewHtml), [previewHtml]);
  const serializedDocument = useMemo(
    () =>
      serializeTemplateDocument({
        meta: layout,
        headerHtml,
        bodyHtml: editorBody,
        footerHtml,
      }),
    [editorBody, footerHtml, headerHtml, layout],
  );
  const plainText = useMemo(() => documentTemplateHtmlToText(serializedDocument), [serializedDocument]);
  const metrics = useMemo(() => resolvePageMetrics(layout), [layout]);
  const pageStyle = useMemo(() => buildPageStyle(layout), [layout]);
  const rulerTicks = useMemo(() => buildRulerTicks(metrics.pageWidthMm), [metrics.pageWidthMm]);
  const wordCount = useMemo(() => countWords(plainText), [plainText]);
  const characterCount = plainText.length;
  const designedPages = useMemo(() => countDesignedPages(serializedDocument), [serializedDocument]);

  useEffect(() => {
    if (!headerEditor || !bodyEditor || !footerEditor) return;
    const serialized = serializeTemplateDocument(parsedDocument);
    if (serialized === lastSerializedRef.current) return;

    setLayout(parsedDocument.meta);
    setHeaderHtml(parsedDocument.headerHtml);
    setFooterHtml(parsedDocument.footerHtml);
    setEditorBody(parsedDocument.bodyHtml);
    headerEditor.commands.setContent(parsedDocument.headerHtml, { emitUpdate: false });
    bodyEditor.commands.setContent(parsedDocument.bodyHtml, { emitUpdate: false });
    footerEditor.commands.setContent(parsedDocument.footerHtml, { emitUpdate: false });
    lastSerializedRef.current = serialized;
  }, [bodyEditor, footerEditor, headerEditor, parsedDocument]);

  useEffect(() => {
    if (serializedDocument === lastSerializedRef.current) return;
    lastSerializedRef.current = serializedDocument;
    onChange(serializedDocument);
  }, [onChange, serializedDocument]);

  // Flash preview on content change
  useEffect(() => {
    setPreviewFlash(true);
    const t = setTimeout(() => setPreviewFlash(false), 300);
    return () => clearTimeout(t);
  }, [editorBody, headerHtml, footerHtml]);

  async function insertUploadedImage(targetEditor: Editor | null | undefined, file: File, position?: number) {
    const upload = await onUploadImage(file);
    const attrs = {
      src: upload.url,
      alt: upload.name || file.name,
      title: upload.name || file.name,
      width: 640,
      align: 'center' as const,
    };

    if (!targetEditor) return;

    if (typeof position === 'number') {
      targetEditor.commands.insertContentAt(position, {
        type: 'resizableImage',
        attrs,
      });
      return;
    }

    targetEditor.chain().focus().setResizableImage(attrs).run();
  }

  async function uploadDroppedImages(
    targetEditor: Editor | null | undefined,
    files: File[],
    startPosition?: number,
  ) {
    if (!targetEditor) return;
    setUploadingImage(true);
    setEditorError(null);

    try {
      let offset = 0;
      for (const file of files) {
        const position = typeof startPosition === 'number' ? startPosition + offset : undefined;
        await insertUploadedImage(targetEditor, file, position);
        offset += 2;
      }
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'ไม่สามารถอัปโหลดรูปภาพ');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      setEditorError(null);
      await insertUploadedImage(activeEditor, file);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'ไม่สามารถอัปโหลดรูปภาพ');
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  }

  function promptForLink() {
    if (!activeEditor) return;
    const previous = activeEditor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Enter link URL', previous || 'https://');
    if (href === null) return;

    if (!href.trim()) {
      activeEditor.chain().focus().unsetLink().run();
      return;
    }

    activeEditor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
  }

  function focusRegion(region: RegionKey) {
    setActiveRegion(region);
    const editorForRegion =
      region === 'header' ? headerEditor : region === 'footer' ? footerEditor : bodyEditor;
    editorForRegion?.commands.focus('end');
  }

  if (!headerEditor || !bodyEditor || !footerEditor || !activeEditor) {
    return <div className="py-10 text-center text-slate-500">Loading editor...</div>;
  }

  return (
    <div className="space-y-4">
        <section className="admin-card overflow-hidden">
          <div className="word-toolbar-shell">
            <div className="word-toolbar-row word-toolbar-row-between">
              <div className="word-region-switcher">
                <RegionButton
                  active={activeRegion === 'header'}
                  label="ส่วนหัว"
                  description="ปรากฏทุกหน้า"
                  onClick={() => focusRegion('header')}
                />
                <RegionButton
                  active={activeRegion === 'body'}
                  label="เนื้อหา"
                  description="เนื้อหาหลัก"
                  onClick={() => focusRegion('body')}
                />
                <RegionButton
                  active={activeRegion === 'footer'}
                  label="ส่วนท้าย"
                  description="ลายเซ็น & อ้างอิง"
                  onClick={() => focusRegion('footer')}
                />
              </div>
              <div className="flex rounded-md overflow-hidden border border-outline" style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'edit' ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'}`}
                >แก้ไข</button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'preview' ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'}`}
                >
                  <Eye className="h-3 w-3" />
                  ตัวอย่าง
                </button>
              </div>
            </div>

            <div style={{ display: viewMode === 'preview' ? 'none' : undefined }}>
            <div className="word-toolbar-row">
              <ToolbarButton label="Undo" onClick={() => {
                activeEditor.chain().focus().undo().run();
                setUndoToast('ย้อนกลับ');
                setTimeout(() => setUndoToast(null), 1200);
              }}>
                <Undo2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Redo" onClick={() => {
                activeEditor.chain().focus().redo().run();
                setUndoToast('ทำซ้ำ');
                setTimeout(() => setUndoToast(null), 1200);
              }}>
                <Redo2 className="h-4 w-4" />
              </ToolbarButton>
              <div className="word-toolbar-separator" />
              <select
                className="word-style-select"
                value={
                  activeEditor.isActive('heading', { level: 1 }) ? 'h1' :
                  activeEditor.isActive('heading', { level: 2 }) ? 'h2' :
                  activeEditor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'h1') activeEditor.chain().focus().toggleHeading({ level: 1 }).run();
                  else if (v === 'h2') activeEditor.chain().focus().toggleHeading({ level: 2 }).run();
                  else if (v === 'h3') activeEditor.chain().focus().toggleHeading({ level: 3 }).run();
                  else activeEditor.chain().focus().setParagraph().run();
                }}
              >
                <option value="p">ย่อหน้า</option>
                <option value="h1">หัวข้อ 1</option>
                <option value="h2">หัวข้อ 2</option>
                <option value="h3">หัวข้อ 3</option>
              </select>
              <div className="word-toolbar-separator" />
              <ToolbarButton
                label="Bold"
                active={activeEditor.isActive('bold')}
                onClick={() => activeEditor.chain().focus().toggleBold().run()}
              >
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Italic"
                active={activeEditor.isActive('italic')}
                onClick={() => activeEditor.chain().focus().toggleItalic().run()}
              >
                <Italic className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Underline"
                active={activeEditor.isActive('underline')}
                onClick={() => activeEditor.chain().focus().toggleUnderline().run()}
              >
                <UnderlineIcon className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Bullets"
                active={activeEditor.isActive('bulletList')}
                onClick={() => activeEditor.chain().focus().toggleBulletList().run()}
              >
                <List className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Numbers"
                active={activeEditor.isActive('orderedList')}
                onClick={() => activeEditor.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered className="h-4 w-4" />
              </ToolbarButton>
              <div className="word-toolbar-separator" />
              <ToolbarButton
                label="Outdent"
                onClick={() => activeEditor.chain().focus().sinkListItem('listItem').run()}
              >
                <Outdent className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Indent"
                onClick={() => activeEditor.chain().focus().liftListItem('listItem').run()}
              >
                <Indent className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Clear Formatting"
                onClick={() => activeEditor.chain().focus().unsetAllMarks().clearNodes().run()}
              >
                <RemoveFormatting className="h-4 w-4" />
              </ToolbarButton>
              <div className="word-toolbar-separator" />
              <ToolbarButton
                label="Left"
                active={activeEditor.isActive({ textAlign: 'left' })}
                onClick={() => activeEditor.chain().focus().setTextAlign('left').run()}
              >
                <AlignLeft className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Center"
                active={activeEditor.isActive({ textAlign: 'center' })}
                onClick={() => activeEditor.chain().focus().setTextAlign('center').run()}
              >
                <AlignCenter className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Right"
                active={activeEditor.isActive({ textAlign: 'right' })}
                onClick={() => activeEditor.chain().focus().setTextAlign('right').run()}
              >
                <AlignRight className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Justify"
                active={activeEditor.isActive({ textAlign: 'justify' })}
                onClick={() => activeEditor.chain().focus().setTextAlign('justify').run()}
              >
                <AlignJustify className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Link"
                active={activeEditor.isActive('link')}
                onClick={promptForLink}
              >
                <Link2 className="h-4 w-4" />
              </ToolbarButton>
            </div>

            <div className="word-toolbar-row">
              <FontFamilyPicker editor={activeEditor} />
              <FontSizePicker editor={activeEditor} />
              <div className="word-color-group" title="Line / Paragraph spacing">
                <select
                  className="admin-select !w-auto !py-1.5"
                  value=""
                  onChange={(event) => {
                    const [spacing, value] = event.target.value.split(':');
                    const chain = activeEditor.chain().focus();
                    if (spacing === 'lh') {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      void (chain as any as { setLineHeight(v: string): { run(): boolean } }).setLineHeight(value).run();
                    } else if (spacing === 'pa') {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      void (chain as any as { setParagraphSpacing(v: string): { run(): boolean } }).setParagraphSpacing(value).run();
                    }
                  }}
                >
                  <option value="">↕ ระยะ</option>
                  <option value="lh:1">บรรทัด 1.0×</option>
                  <option value="lh:1.15">บรรทัด 1.15×</option>
                  <option value="lh:1.5">บรรทัด 1.5×</option>
                  <option value="lh:1.75">บรรทัด 1.75×</option>
                  <option value="lh:2">บรรทัด 2.0×</option>
                  <option disabled>—</option>
                  <option value="pa:0">ก่อนย่อหน้า: 0</option>
                  <option value="pa:6">ก่อนย่อหน้า: 6pt</option>
                  <option value="pa:12">ก่อนย่อหน้า: 12pt</option>
                  <option value="pa:18">ก่อนย่อหน้า: 18pt</option>
                  <option disabled>—</option>
                  <option value="pa:-6">หลังย่อหน้า: 6pt</option>
                  <option value="pa:-12">หลังย่อหน้า: 12pt</option>
                </select>
              </div>
              <ToolbarButton
                label={activeEditor.isActive('columns') ? 'นำ 2 คอลัมน์ออก' : 'แบ่ง 2 คอลัมน์'}
                active={activeEditor.isActive('columns')}
                onClick={() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const chain = (activeEditor.chain().focus() as any) as {
                    selectParentNode(): { lift(): { run(): boolean } };
                    insertContent(node: object): { run(): boolean };
                  };
                  if (activeEditor.isActive('columns')) {
                    chain.selectParentNode().lift().run();
                  } else {
                    const columnsType = activeEditor.schema.nodes['columns'];
                    if (columnsType) {
                      chain.insertContent(columnsType.create({ count: 2 })).run();
                    }
                  }
                }}
              >
                <Columns3 className="h-4 w-4" />
              </ToolbarButton>
              <div className="word-toolbar-separator" />
              <div className="word-color-group" title="สีตัวอักษร">
                <PaintBucket className="h-3.5 w-3.5 text-slate-500" />
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="word-color-swatch"
                    style={{ backgroundColor: color, width: 16, height: 16 }}
                    title={color}
                    onClick={() => activeEditor.chain().focus().setColor(color).run()}
                  />
                ))}
              </div>
              <div className="word-color-group" title="ไฮไลท์">
                <Highlighter className="h-3.5 w-3.5 text-slate-500" />
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="word-color-swatch"
                    style={{ backgroundColor: color, width: 16, height: 16 }}
                    title={color}
                    onClick={() => activeEditor.chain().focus().toggleHighlight({ color }).run()}
                  />
                ))}
              </div>
              <div className="word-toolbar-separator" />
              <ToolbarButton
                label="Insert Table"
                onClick={() =>
                  activeEditor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
              >
                <Rows3 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Page Break" onClick={() => activeEditor.chain().focus().insertPageBreak().run()}>
                <ArrowDownToLine className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Image" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="h-4 w-4" />
              </ToolbarButton>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => void handleImageSelect(event)}
              />
            </div>

            {/* Contextual Table Bar — only visible when cursor is inside a table */}
            {activeEditor.isActive('table') && (
              <div className="word-toolbar-row" style={{ background: 'rgba(245, 158, 11, 0.06)', borderTop: '1px solid rgba(245, 158, 11, 0.25)' }}>
                <span className="word-toolbar-label" style={{ color: '#b45309', fontWeight: 600 }}>Table</span>
                <div className="word-toolbar-separator" />
                <ToolbarButton
                  label="Add Row Below"
                  disabled={!activeEditor.can().addRowAfter()}
                  onClick={() => activeEditor.chain().focus().addRowAfter().run()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="text-[10px] leading-none">Row</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Add Column Right"
                  disabled={!activeEditor.can().addColumnAfter()}
                  onClick={() => activeEditor.chain().focus().addColumnAfter().run()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="text-[10px] leading-none">Col</span>
                </ToolbarButton>
                <div className="word-toolbar-separator" />
                <ToolbarButton
                  label="Merge Cells"
                  disabled={!activeEditor.can().mergeCells()}
                  onClick={() => activeEditor.chain().focus().mergeCells().run()}
                >
                  <SplitSquareVertical className="h-4 w-4 rotate-90" />
                </ToolbarButton>
                <ToolbarButton
                  label="Split Cell"
                  disabled={!activeEditor.can().splitCell()}
                  onClick={() => activeEditor.chain().focus().splitCell().run()}
                >
                  <SplitSquareVertical className="h-4 w-4" />
                </ToolbarButton>
                <div className="word-toolbar-separator" />
                <ToolbarButton
                  label="Delete Row"
                  disabled={!activeEditor.can().deleteRow()}
                  onClick={() => activeEditor.chain().focus().deleteRow().run()}
                >
                  <Minus className="h-3.5 w-3.5" />
                  <span className="text-[10px] leading-none">Row</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Delete Column"
                  disabled={!activeEditor.can().deleteColumn()}
                  onClick={() => activeEditor.chain().focus().deleteColumn().run()}
                >
                  <Minus className="h-3.5 w-3.5" />
                  <span className="text-[10px] leading-none">Col</span>
                </ToolbarButton>
                <ToolbarButton
                  label="Delete Table"
                  disabled={!activeEditor.can().deleteTable()}
                  onClick={() => activeEditor.chain().focus().deleteTable().run()}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </ToolbarButton>
              </div>
            )}

            {/* Row 3: Block Palette + Font Size + Page Setup */}
            <div className="word-toolbar-row word-toolbar-row-gap-sm">
              <BlockPalette activeEditor={activeEditor} />

              <div className="word-toolbar-separator" style={{ margin: '0 4px' }} />

              <div className="word-color-group" style={{ flexShrink: 0 }}>
                <span className="word-toolbar-label">ขนาดหน้า</span>
                <select
                  className="admin-select !w-auto !py-1.5"
                  value={layout.fontSize}
                  onChange={(event) =>
                    setLayout((current) => ({
                      ...current,
                      fontSize: event.target.value as TemplateDocumentMeta['fontSize'],
                    }))
                  }
                >
                  <option value="sm">14px</option>
                  <option value="base">15px</option>
                  <option value="lg">17px</option>
                </select>
              </div>

              <ToolbarButton label="ตั้งค่าหน้า" onClick={() => setShowPageSetup(true)}>
                <Settings2 className="h-4 w-4" />
              </ToolbarButton>

              {/* Inline URL image input */}
              <div className="relative flex items-center">
                <ToolbarButton
                  label={showUrlInput ? 'ยกเลิก' : 'ใส่รูปจาก URL'}
                  active={showUrlInput}
                  onClick={() => {
                    setShowUrlInput((v) => !v);
                    setUrlInputValue('');
                  }}
                >
                  <LinkIcon className="h-4 w-4" />
                </ToolbarButton>
                {showUrlInput && (
                  <div className="absolute top-full left-0 z-50 mt-1 flex items-center gap-1.5 rounded-lg border border-outline bg-surface-container-lowest px-2 py-1.5 shadow-md">
                    <input
                      autoFocus
                      type="url"
                      placeholder="https://..."
                      value={urlInputValue}
                      onChange={(e) => setUrlInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { setShowUrlInput(false); setUrlInputValue(''); }
                      }}
                      className="h-7 w-56 rounded border border-outline bg-surface-container-lowest px-2 text-xs text-on-surface outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      disabled={!urlInputValue.trim() || uploadingImage}
                      className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-on-primary disabled:opacity-50"
                      onClick={() => {
                        const url = urlInputValue.trim();
                        if (!url) return;
                        setShowUrlInput(false);
                        setUrlInputValue('');
                        setEditorError(null);
                        setUploadingImage(true);
                        void (async () => {
                          try {
                            const res = await fetch(`/api/templates/${templateId}/upload-image-from-url`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ url }),
                            });
                            const json = await res.json();
                            if (!json.success) throw new Error(json.error?.message ?? 'ดึงรูปไม่สำเร็จ');
                            activeEditor.chain().focus().setResizableImage({
                              src: json.data.url,
                              alt: url.split('/').pop() ?? 'image',
                              width: 640,
                              align: 'center',
                            }).run();
                          } catch (e) {
                            setEditorError(e instanceof Error ? e.message : 'ดึงรูปไม่สำเร็จ');
                          } finally {
                            setUploadingImage(false);
                          }
                        })();
                      }}
                    >
                      ใส่รูป
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowUrlInput(false); setUrlInputValue(''); }}
                      className="flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            </div>{/* end edit-only toolbar rows */}
          </div>{/* end word-toolbar-shell */}

          {viewMode === 'edit' ? (
          <div className="word-editor-shell">
            <div className="word-ruler-shell" style={pageStyle}>
              <div className="word-ruler">
                <div className="word-ruler-track">
                  <div
                    className="word-ruler-margin word-ruler-margin-left"
                    style={{ width: `${metrics.marginXMm}mm` }}
                  />
                  <div
                    className="word-ruler-margin word-ruler-margin-right"
                    style={{ width: `${metrics.marginXMm}mm` }}
                  />
                  {rulerTicks.map((tick) => (
                    <div
                      key={tick}
                      className={`word-ruler-tick ${tick % 20 === 0 ? 'word-ruler-tick-major' : ''}`}
                      style={{ left: `${(tick / metrics.pageWidthMm) * 100}%` }}
                    >
                      {tick > 0 && tick < metrics.pageWidthMm && tick % 20 === 0 ? (
                        <span>{tick}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="word-editor-page" style={pageStyle}>
              <section
                className={`word-editor-region word-editor-region-header ${activeRegion === 'header' ? 'word-editor-region-active' : ''}`}
                onMouseDown={() => setActiveRegion('header')}
              >
                <div className="word-region-strip word-region-strip-header">
                  <span>ส่วนหัว</span>
                  <span className="word-region-strip-hint">ปรากฏทุกหน้า</span>
                </div>
                <EditorContent editor={headerEditor} />
                <div className="word-region-divider" />
              </section>

              <section
                className={`word-editor-region word-editor-region-body ${activeRegion === 'body' ? 'word-editor-region-active' : ''}`}
                onMouseDown={() => setActiveRegion('body')}
              >
                <EditorContent editor={bodyEditor} />
              </section>

              {/* Floating inline toolbar — appears on text selection */}
              {bodyEditor && <FloatingToolbar editor={bodyEditor} />}

              {/* Undo/Redo toast */}
              {undoToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
                  <div className="bg-slate-800 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                    <Undo2 className="h-3 w-3" />
                    {undoToast}
                  </div>
                </div>
              )}

              <section
                className={`word-editor-region word-editor-region-footer ${activeRegion === 'footer' ? 'word-editor-region-active' : ''}`}
                onMouseDown={() => setActiveRegion('footer')}
              >
                <div className="word-region-divider" />
                <div className="word-region-strip word-region-strip-footer">
                  <span>ส่วนท้าย</span>
                  <span className="word-region-strip-hint">ลายเซ็น & อ้างอิง</span>
                </div>
                <EditorContent editor={footerEditor} />
              </section>
            </div>
          </div>

          ) : (
          <div className="word-editor-shell">
            <div className="word-editor-page" style={pageStyle}>
              {previewDocument.headerHtml !== '<p></p>' && (
                <section className="word-editor-region">
                  <div className="word-region-strip word-region-strip-header">
                    <span>ส่วนหัว</span>
                    <span className="word-region-strip-hint">ปรากฏทุกหน้า</span>
                  </div>
                  <div className="word-editor-content word-editor-content-region" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewDocument.headerHtml) }} />
                  <div className="word-region-divider" />
                </section>
              )}
              <section className="word-editor-region word-editor-region-body">
                <div className="word-editor-content word-editor-content-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewDocument.bodyHtml) }} />
              </section>
              {previewDocument.footerHtml !== '<p></p>' && (
                <section className="word-editor-region">
                  <div className="word-region-divider" />
                  <div className="word-region-strip word-region-strip-footer">
                    <span>ส่วนท้าย</span>
                    <span className="word-region-strip-hint">ลายเซ็น & อ้างอิง</span>
                  </div>
                  <div className="word-editor-content word-editor-content-region" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewDocument.footerHtml) }} />
                </section>
              )}
            </div>
          </div>
          )}

          <div className="word-editor-footer">
            <div className="word-editor-footer-stats">
              <span>{wordCount} คำ</span>
              <span>{characterCount} ตัวอักษร</span>
              <span>{designedPages} หน้า</span>
            </div>
            {uploadingImage && (
              <span className="text-xs text-on-surface-variant animate-pulse">กำลังอัปโหลดรูป...</span>
            )}
          </div>
        </section>

        {editorError ? <div className="auth-alert auth-alert-error">{editorError}</div> : null}


        {/* ── Puppeteer Real Print Preview Modal ─────────────────── */}
        {puppeteerPreviewUrl ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) closePuppeteerPreview(); }}
          >
            <div className="relative flex max-h-[95vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between gap-4 border-b border-outline-variant px-5 py-3">
                <div className="text-sm font-semibold text-on-surface">
                  ตัวอย่างเอกสารจริง (Chromium)
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={puppeteerPreviewUrl}
                    download={`template-preview-${Date.now()}.png`}
                    className="flex items-center gap-1.5 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    ดาวน์โหลด PNG
                  </a>
                  <button
                    type="button"
                    onClick={closePuppeteerPreview}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Preview image */}
              <div className="flex-1 overflow-auto p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={puppeteerPreviewUrl}
                  alt="Template preview"
                  className="max-w-full rounded-lg shadow-md"
                  style={{ maxHeight: '80vh' }}
                />
              </div>

              {previewError && (
                <div className="border-t border-red-100 bg-red-50 px-5 py-3">
                  <p className="text-xs text-red-600">{previewError}</p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Find & Replace Modal */}
        <FindReplaceModal activeEditor={activeEditor} />

        {/* Page Setup Modal */}
        {showPageSetup && (
          <PageSetupModal
            layout={layout}
            onSave={(updated) => {
              setLayout(updated);
              setShowPageSetup(false);
            }}
            onClose={() => setShowPageSetup(false)}
          />
        )}
    </div>
  );
}
