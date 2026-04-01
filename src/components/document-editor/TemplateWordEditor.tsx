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
  Bold,
  Columns3,
  Eye,
  FileDown,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Outdent,
  PaintBucket,
  Pilcrow,
  Printer,
  Redo2,
  RemoveFormatting,
  Rows3,
  Save,
  SplitSquareVertical,
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

type QuickBlock = {
  label: string;
  html: string;
};

type TemplateWordEditorProps = {
  value: string;
  subject: string;
  previewValues: Record<string, string>;
  variables: string[];
  quickBlocks: QuickBlock[];
  onChange: (html: string) => void;
  onUploadImage: (file: File) => Promise<{ url: string; name?: string }>;
  /** When set, the "Real Preview" button resolves DB data and renders with真实 values */
  templateId?: string;
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
const FONT_FAMILIES = [
  { label: 'Document Default', value: '' },
  { label: 'Segoe UI', value: '"Segoe UI", "Inter", system-ui, sans-serif' },
  { label: 'Sarabun', value: '"Sarabun", "Segoe UI", system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
];

function resolvePageMetrics(meta: TemplateDocumentMeta): PageMetrics {
  const isLetter = meta.pageSize === 'LETTER';
  const isLandscape = meta.orientation === 'LANDSCAPE';
  const marginPreset = meta.marginPreset ?? 'normal';
  const marginXMm = MARGIN_PRESET_MM[marginPreset] ?? 18;
  const marginTopMm = MARGIN_TOP_BOTTOM_MM[marginPreset] ?? 18;
  const marginBottomMm = MARGIN_TOP_BOTTOM_MM[marginPreset] ?? 18;

  // Portrait: width < height. Landscape: swap them.
  const portraitWidth = isLetter ? '216mm' : '210mm';
  const portraitHeight = isLetter ? '279mm' : '297mm';
  const portraitWidthMm = isLetter ? 216 : 210;

  return {
    pageWidth: isLandscape ? portraitHeight : portraitWidth,
    pageMinHeight: isLandscape ? portraitWidth : portraitHeight,
    pageWidthMm: isLandscape ? portraitWidthMm : portraitWidthMm,
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
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
    }),
    Underline,
    TextStyle,
    FontFamily,
    Color,
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      autolink: false,
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Placeholder.configure({
      placeholder,
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    ResizableImage,
    PageBreak,
    Columns,
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
  subject,
  previewValues,
  variables,
  quickBlocks,
  onChange,
  onUploadImage,
  templateId,
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
  const [puppeteerPreviewUrl, setPuppeteerPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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
    extensions: createWordExtensions('Add a repeating header for every page...'),
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
    extensions: createWordExtensions('Add a repeating footer for every page...'),
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <section className="admin-card overflow-hidden">
          <div className="word-toolbar-shell">
            <div className="word-toolbar-row word-toolbar-row-between">
              <div className="word-region-switcher">
                <RegionButton
                  active={activeRegion === 'header'}
                  label="Header"
                  description="Repeats on every page"
                  onClick={() => focusRegion('header')}
                />
                <RegionButton
                  active={activeRegion === 'body'}
                  label="Body"
                  description="Main document content"
                  onClick={() => focusRegion('body')}
                />
                <RegionButton
                  active={activeRegion === 'footer'}
                  label="Footer"
                  description="Sign-off and references"
                  onClick={() => focusRegion('footer')}
                />
              </div>
              <div className="word-toolbar-context">
                Editing <strong>{activeRegion}</strong>
              </div>
            </div>

            <div className="word-toolbar-row">
              <ToolbarButton label="Undo" onClick={() => activeEditor.chain().focus().undo().run()}>
                <Undo2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Redo" onClick={() => activeEditor.chain().focus().redo().run()}>
                <Redo2 className="h-4 w-4" />
              </ToolbarButton>
              <div className="word-toolbar-separator" />
              <ToolbarButton
                label="Heading 1"
                active={activeEditor.isActive('heading', { level: 1 })}
                onClick={() => activeEditor.chain().focus().toggleHeading({ level: 1 }).run()}
              >
                <Heading1 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Heading 2"
                active={activeEditor.isActive('heading', { level: 2 })}
                onClick={() => activeEditor.chain().focus().toggleHeading({ level: 2 }).run()}
              >
                <Heading2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Heading 3"
                active={activeEditor.isActive('heading', { level: 3 })}
                onClick={() => activeEditor.chain().focus().toggleHeading({ level: 3 }).run()}
              >
                <Heading3 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Paragraph"
                active={activeEditor.isActive('paragraph')}
                onClick={() => activeEditor.chain().focus().setParagraph().run()}
              >
                <Pilcrow className="h-4 w-4" />
              </ToolbarButton>
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
              <div className="word-color-group">
                <span className="word-toolbar-label">Font</span>
                <select
                  className="admin-select !w-auto !py-1.5"
                  value={(activeEditor.getAttributes('textStyle').fontFamily as string | undefined) || ''}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (!nextValue) {
                      activeEditor.chain().focus().unsetFontFamily().run();
                    } else {
                      activeEditor.chain().focus().setFontFamily(nextValue).run();
                    }
                  }}
                >
                  {FONT_FAMILIES.map((family) => (
                    <option key={family.label} value={family.value}>
                      {family.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="word-color-group">
                <span className="word-toolbar-label">Spacing</span>
                <select
                  className="admin-select !w-auto !py-1.5"
                  value=""
                  onChange={(event) => {
                    const [spacing, value] = event.target.value.split(':');
                    const chain = activeEditor.chain().focus();
                    if (spacing === 'lh') {
                      void (chain as unknown as { setLineHeight(v: string): { run(): boolean } }).setLineHeight(value).run();
                    } else if (spacing === 'pa') {
                      void (chain as unknown as { setParagraphSpacing(v: string): { run(): boolean } }).setParagraphSpacing(value).run();
                    }
                  }}
                >
                  <option value="">Line Height</option>
                  <option value="lh:1">Single (1.0)</option>
                  <option value="lh:1.15">1.15</option>
                  <option value="lh:1.5">1.5</option>
                  <option value="lh:1.75">1.75</option>
                  <option value="lh:2">Double (2.0)</option>
                  <option disabled>—</option>
                  <option value="pa:0">Space before: 0</option>
                  <option value="pa:6">Space before: 6pt</option>
                  <option value="pa:12">Space before: 12pt</option>
                  <option value="pa:18">Space before: 18pt</option>
                  <option disabled>—</option>
                  <option value="pa:-6">Space after: 6pt</option>
                  <option value="pa:-12">Space after: 12pt</option>
                </select>
              </div>
              <div className="word-color-group">
                <span className="word-toolbar-label">Columns</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                  onClick={() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const chain = activeEditor.chain().focus() as any;
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
                  <Columns3 className="h-3.5 w-3.5" />
                  {activeEditor.isActive('columns') ? 'Remove' : '2 Col'}
                </button>
              </div>
              <div className="word-color-group">
                <span className="word-toolbar-label">
                  <PaintBucket className="h-4 w-4" />
                  Text
                </span>
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="word-color-swatch"
                    style={{ backgroundColor: color }}
                    onClick={() => activeEditor.chain().focus().setColor(color).run()}
                  />
                ))}
              </div>
              <div className="word-color-group">
                <span className="word-toolbar-label">
                  <Highlighter className="h-4 w-4" />
                  Highlight
                </span>
                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="word-color-swatch"
                    style={{ backgroundColor: color }}
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
              <ToolbarButton
                label="Add Row"
                disabled={!activeEditor.can().addRowAfter()}
                onClick={() => activeEditor.chain().focus().addRowAfter().run()}
              >
                <span className="text-xs font-semibold">+Row</span>
              </ToolbarButton>
              <ToolbarButton
                label="Add Column"
                disabled={!activeEditor.can().addColumnAfter()}
                onClick={() => activeEditor.chain().focus().addColumnAfter().run()}
              >
                <span className="text-xs font-semibold">+Col</span>
              </ToolbarButton>
              <ToolbarButton
                label="Delete Row"
                disabled={!activeEditor.can().deleteRow()}
                onClick={() => activeEditor.chain().focus().deleteRow().run()}
              >
                <span className="text-xs font-semibold">Del Row</span>
              </ToolbarButton>
              <ToolbarButton
                label="Delete Column"
                disabled={!activeEditor.can().deleteColumn()}
                onClick={() => activeEditor.chain().focus().deleteColumn().run()}
              >
                <span className="text-xs font-semibold">Del Col</span>
              </ToolbarButton>
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
              <ToolbarButton
                label="Delete Table"
                disabled={!activeEditor.can().deleteTable()}
                onClick={() => activeEditor.chain().focus().deleteTable().run()}
              >
                <span className="text-xs font-semibold">Del Tbl</span>
              </ToolbarButton>
              <ToolbarButton label="Page Break" onClick={() => activeEditor.chain().focus().insertPageBreak().run()}>
                <span className="text-xs font-semibold">Page</span>
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
          </div>

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
              <div className="word-editor-page-header">
                <div>
                  <div className="word-editor-page-label">Document Title</div>
                  <div className="word-editor-page-title">{subject || 'Untitled template'}</div>
                </div>
                <div className="word-editor-page-meta">
                  Header and footer repeat on every page. Insert page breaks where you want the layout to split.
                </div>
              </div>

              <section
                className={`word-editor-region ${activeRegion === 'header' ? 'word-editor-region-active' : ''}`}
                onMouseDown={() => setActiveRegion('header')}
              >
                <div className="word-editor-region-bar">
                  <div>
                    <div className="word-editor-region-label">Header</div>
                    <div className="word-editor-region-copy">Letterhead, logo, address, repeating document markers</div>
                  </div>
                  <button type="button" className="word-editor-region-action" onClick={() => focusRegion('header')}>
                    Edit header
                  </button>
                </div>
                <EditorContent editor={headerEditor} />
              </section>

              <section
                className={`word-editor-region ${activeRegion === 'body' ? 'word-editor-region-active' : ''}`}
                onMouseDown={() => setActiveRegion('body')}
              >
                <div className="word-editor-region-bar">
                  <div>
                    <div className="word-editor-region-label">Body</div>
                    <div className="word-editor-region-copy">Main content, tables, images, page breaks, and merge fields</div>
                  </div>
                  <button type="button" className="word-editor-region-action" onClick={() => focusRegion('body')}>
                    Edit body
                  </button>
                </div>
                <EditorContent editor={bodyEditor} />
              </section>

              <section
                className={`word-editor-region ${activeRegion === 'footer' ? 'word-editor-region-active' : ''}`}
                onMouseDown={() => setActiveRegion('footer')}
              >
                <div className="word-editor-region-bar">
                  <div>
                    <div className="word-editor-region-label">Footer</div>
                    <div className="word-editor-region-copy">Approvals, legal text, references, and repeating sign-off blocks</div>
                  </div>
                  <button type="button" className="word-editor-region-action" onClick={() => focusRegion('footer')}>
                    Edit footer
                  </button>
                </div>
                <EditorContent editor={footerEditor} />
              </section>
            </div>
          </div>

          <div className="word-editor-footer">
            <div className="word-editor-footer-hint">
              {uploadingImage
                ? 'Uploading image...'
                : 'Supports repeating headers/footers, page setup, tables, resizeable images, links, and drag-drop screenshots.'}
            </div>
            <div className="word-editor-footer-stats">
              <span>{designedPages} designed page{designedPages === 1 ? '' : 's'}</span>
              <span>{wordCount} words</span>
              <span>{characterCount} characters</span>
            </div>
            <div className="word-editor-footer-hint flex items-center gap-2">
              <Save className="h-4 w-4" />
              Saved as structured HTML with document layout metadata.
            </div>
          </div>
        </section>

        {editorError ? <div className="auth-alert auth-alert-error">{editorError}</div> : null}

        <section className="admin-card word-preview-card">
          {/* ── Print Preview Header ────────────────────────────── */}
          <div className="admin-card-header flex-wrap gap-2">
            <div className="admin-card-title flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Print Preview
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {/* Zoom controls */}
              <div className="flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-1 py-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewZoom((z) => Math.max(25, z - 10))}
                  className="flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
                  title="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center text-xs font-mono font-medium text-on-surface">{previewZoom}%</span>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((z) => Math.min(200, z + 10))}
                  className="flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
                  title="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(100)}
                  className="flex h-7 w-7 items-center justify-center rounded text-on-surface-variant hover:bg-surface-container"
                  title="Fit to width"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Margin guides toggle */}
              <button
                type="button"
                onClick={() => setShowMarginGuides((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  showMarginGuides
                    ? 'border-primary/40 bg-primary/5 text-primary'
                    : 'border-outline bg-surface-container-lowest text-on-surface-variant'
                }`}
                title="Toggle margin guides"
              >
                <span className="h-2 w-2 rounded-full border border-current" />
                Guides
              </button>

              {/* Print button */}
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
                title="Print (or save as PDF)"
              >
                <Printer className="h-3.5 w-3.5" />
                Print / PDF
              </button>

              {/* Real browser preview — Puppeteer screenshot */}
              <button
                type="button"
                onClick={() => void generatePuppeteerPreview()}
                disabled={isGeneratingPreview}
                className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-primary/10 disabled:opacity-60"
                title="ดูตัวอย่างเอกสารที่พิมพ์จริง (ใช้ Chromium)"
              >
                {isGeneratingPreview ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    กำลังโหลด...
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    {templateId ? 'ดูตัวอย่างจริง (DB)' : 'ดูตัวอย่าง (HTML)'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ── A4 Paper Preview ───────────────────────────────── */}
          <div className="word-preview-shell overflow-auto">
            {/* Scale wrapper — transforms the paper to simulate zoom */}
            <div
              className="word-paper-scale mx-auto my-6"
              style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: 'top center' }}
            >
              {/* Drop shadow beneath paper */}
              <div className="word-paper-shadow" />

              {/* A4 Paper */}
              <div className={`word-paper-a4 ${layout.pageSize === 'LETTER' ? 'word-paper-letter' : ''} ${layout.orientation === 'LANDSCAPE' ? 'word-paper-landscape' : ''}`}>
                {/* Margin guides overlay */}
                {showMarginGuides && (
                  <div className="word-margin-guide">
                    <div className="word-margin-guide-inner" />
                    {/* Top-left corner label */}
                    <span className="word-margin-guide-label" style={{ top: 4, left: 4 }}>
                      {metrics.marginTop}
                    </span>
                    {/* Bottom-right corner label */}
                    <span className="word-margin-guide-label" style={{ bottom: 4, right: 4 }}>
                      {metrics.marginBottom}
                    </span>
                  </div>
                )}

                {/* Header */}
                {previewDocument.headerHtml !== '<p></p>' && (
                  <div className="word-preview-region word-preview-region-first">
                    <div className="word-preview-region-label">Header</div>
                    <div
                      className="word-preview-content word-preview-content-region"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewDocument.headerHtml) }}
                    />
                  </div>
                )}

                {/* Body */}
                <div className="word-preview-region">
                  <div className="word-preview-region-label">Body</div>
                  <div
                    className="word-preview-content"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewDocument.bodyHtml) }}
                  />
                </div>

                {/* Footer */}
                {previewDocument.footerHtml !== '<p></p>' && (
                  <div className="word-preview-region">
                    <div className="word-preview-region-label">Footer</div>
                    <div
                      className="word-preview-content word-preview-content-region"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewDocument.footerHtml) }}
                    />
                  </div>
                )}

                {/* Page indicator */}
                <div className="word-page-indicator">
                  Page 1 — {layout.pageSize} {layout.orientation === 'LANDSCAPE' ? 'Landscape' : 'Portrait'}
                  {layout.pageSize === 'LETTER'
                    ? layout.orientation === 'LANDSCAPE' ? ' (11 × 8.5 in)' : ' (8.5 × 11 in)'
                    : layout.orientation === 'LANDSCAPE' ? ' (297 × 210 mm)' : ' (210 × 297 mm)'}
                </div>
              </div>
            </div>
          </div>

          {/* ── Print hint ───────────────────────────────────── */}
          <div className="border-t border-outline-variant px-5 py-3">
            <p className="text-xs text-on-surface-variant">
              <strong>Print:</strong> Use browser Print (Ctrl+P) to save as PDF or print directly.{' '}
              <strong>Zoom:</strong> Scales the paper preview. Margin guides (blue dashes) show printable area.{' '}
              Content overflow beyond the page height will be clipped in print.
            </p>
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Page Setup</div>
          </div>
          <div className="grid gap-3 p-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Page Size</label>
              <select
                className="admin-select"
                value={layout.pageSize}
                onChange={(event) =>
                  setLayout((current) => ({
                    ...current,
                    pageSize: event.target.value as TemplateDocumentMeta['pageSize'],
                  }))
                }
              >
                <option value="A4">A4</option>
                <option value="LETTER">Letter</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Orientation</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    layout.orientation === 'PORTRAIT'
                      ? 'border-primary bg-primary-container text-primary'
                      : 'border-outline bg-surface-container-lowest text-on-surface-variant'
                  }`}
                  onClick={() => setLayout((current) => ({ ...current, orientation: 'PORTRAIT' }))}
                >
                  แนวตั้ง
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    layout.orientation === 'LANDSCAPE'
                      ? 'border-primary bg-primary-container text-primary'
                      : 'border-outline bg-surface-container-lowest text-on-surface-variant'
                  }`}
                  onClick={() => setLayout((current) => ({ ...current, orientation: 'LANDSCAPE' }))}
                >
                  แนวนอน
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Margins</label>
              <select
                className="admin-select"
                value={layout.marginPreset}
                onChange={(event) =>
                  setLayout((current) => ({
                    ...current,
                    marginPreset: event.target.value as TemplateDocumentMeta['marginPreset'],
                  }))
                }
              >
                <option value="narrow">Narrow</option>
                <option value="normal">Normal</option>
                <option value="wide">Wide</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Document Font</label>
              <select
                className="admin-select"
                value={layout.fontFamily}
                onChange={(event) =>
                  setLayout((current) => ({
                    ...current,
                    fontFamily: event.target.value as TemplateDocumentMeta['fontFamily'],
                  }))
                }
              >
                <option value="sans">Sans</option>
                <option value="sarabun">Sarabun</option>
                <option value="serif">Serif</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Font Size</label>
              <select
                className="admin-select"
                value={layout.fontSize}
                onChange={(event) =>
                  setLayout((current) => ({
                    ...current,
                    fontSize: event.target.value as TemplateDocumentMeta['fontSize'],
                  }))
                }
              >
                <option value="sm">Small</option>
                <option value="base">Base</option>
                <option value="lg">Large</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Line Spacing</label>
              <select
                className="admin-select"
                value={layout.lineHeight}
                onChange={(event) =>
                  setLayout((current) => ({
                    ...current,
                    lineHeight: event.target.value as TemplateDocumentMeta['lineHeight'],
                  }))
                }
              >
                <option value="normal">Normal</option>
                <option value="relaxed">Relaxed</option>
                <option value="loose">Loose</option>
              </select>
            </div>
          </div>
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Editor Status</div>
          </div>
          <div className="grid gap-3 p-4">
            <div className="word-status-grid">
              <div className="word-status-card">
                <div className="word-status-label">Active Region</div>
                <div className="word-status-value capitalize">{activeRegion}</div>
              </div>
              <div className="word-status-card">
                <div className="word-status-label">Designed Pages</div>
                <div className="word-status-value">{designedPages}</div>
              </div>
              <div className="word-status-card">
                <div className="word-status-label">Words</div>
                <div className="word-status-value">{wordCount}</div>
              </div>
              <div className="word-status-card">
                <div className="word-status-label">Characters</div>
                <div className="word-status-value">{characterCount}</div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              This is now stored as a structured document with separate header, body, footer, page size, margin, font, and spacing metadata.
            </p>
          </div>
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Variables</div>
          </div>
          <div className="space-y-3 p-4">
            <p className="text-xs text-slate-500">
              Insert merge fields into whichever region you are editing. These remain plain tokens so the current document engine can replace them safely at runtime.
            </p>
            <div className="flex flex-wrap gap-2">
              {variables.map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => activeEditor.chain().focus().insertContent(variable).run()}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-mono text-xs text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
                >
                  {variable}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Quick Blocks</div>
          </div>
          <div className="grid gap-2 p-4">
            {quickBlocks.map((block) => (
              <button
                key={block.label}
                type="button"
                onClick={() => activeEditor.chain().focus().insertContent(block.html).run()}
                className="admin-button justify-center"
              >
                {block.label}
              </button>
            ))}
          </div>
        </section>

        <section className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Sample Data</div>
          </div>
          <div className="space-y-2 p-4 text-sm text-slate-600">
            {Object.entries(previewValues).map(([key, nextValue]) => (
              <div
                key={key}
                className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <code className="font-mono text-xs text-slate-500">{key}</code>
                <span className="text-right text-sm text-slate-800">{nextValue}</span>
              </div>
            ))}
          </div>
        </section>

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
      </div>
    </div>
  );
}
