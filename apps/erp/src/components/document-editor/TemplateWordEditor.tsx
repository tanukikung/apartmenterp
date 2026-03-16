'use client';

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
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  PaintBucket,
  Pilcrow,
  Redo2,
  Rows3,
  Save,
  SplitSquareVertical,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import {
  applyTemplateVariables,
  documentTemplateHtmlToText,
  parseTemplateDocument,
  serializeTemplateDocument,
  type TemplateDocumentMeta,
  normalizeDocumentTemplateBody,
} from '@/lib/templates/document-template';
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
  const marginXMm = meta.marginPreset === 'narrow' ? 14 : meta.marginPreset === 'wide' ? 24 : 18;
  const marginTopMm = meta.marginPreset === 'narrow' ? 12 : meta.marginPreset === 'wide' ? 22 : 18;
  const marginBottomMm = meta.marginPreset === 'narrow' ? 12 : meta.marginPreset === 'wide' ? 22 : 18;
  const fontFamily =
    meta.fontFamily === 'serif'
      ? 'Georgia, "Times New Roman", serif'
      : meta.fontFamily === 'sarabun'
        ? '"Sarabun", "Segoe UI", system-ui, sans-serif'
        : '"Segoe UI", "Inter", system-ui, sans-serif';

  return {
    pageWidth: isLetter ? '216mm' : '210mm',
    pageMinHeight: isLetter ? '279mm' : '297mm',
    pageWidthMm: isLetter ? 216 : 210,
    marginX: `${marginXMm}mm`,
    marginXMm,
    marginTop: `${marginTopMm}mm`,
    marginBottom: `${marginBottomMm}mm`,
    fontFamily,
    fontSize: meta.fontSize === 'sm' ? '14px' : meta.fontSize === 'lg' ? '17px' : '15px',
    lineHeight: meta.lineHeight === 'normal' ? '1.5' : meta.lineHeight === 'loose' ? '2' : '1.75',
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
}: TemplateWordEditorProps) {
  const parsedDocument = useMemo(() => parseTemplateDocument(value), [value]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSerializedRef = useRef(serializeTemplateDocument(parsedDocument));
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [layout, setLayout] = useState<TemplateDocumentMeta>(parsedDocument.meta);
  const [headerHtml, setHeaderHtml] = useState(parsedDocument.headerHtml);
  const [footerHtml, setFooterHtml] = useState(parsedDocument.footerHtml);
  const [editorBody, setEditorBody] = useState(parsedDocument.bodyHtml);
  const [activeRegion, setActiveRegion] = useState<RegionKey>('body');

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
      setEditorError(error instanceof Error ? error.message : 'Unable to upload image');
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
      setEditorError(error instanceof Error ? error.message : 'Unable to upload image');
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

        <section className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-title">Live Preview</div>
          </div>
          <div className="word-preview-shell">
            <div className="word-editor-page" style={pageStyle}>
              <div
                className={`word-preview-region ${previewDocument.headerHtml === '<p></p>' ? 'word-preview-region-empty' : ''}`}
              >
                <div className="word-preview-region-label">Header Preview</div>
                <div
                  className="word-preview-content word-preview-content-region"
                  dangerouslySetInnerHTML={{ __html: previewDocument.headerHtml }}
                />
              </div>
              <div className="word-preview-region">
                <div className="word-preview-region-label">Body Preview</div>
                <div
                  className="word-preview-content"
                  dangerouslySetInnerHTML={{ __html: previewDocument.bodyHtml }}
                />
              </div>
              <div
                className={`word-preview-region ${previewDocument.footerHtml === '<p></p>' ? 'word-preview-region-empty' : ''}`}
              >
                <div className="word-preview-region-label">Footer Preview</div>
                <div
                  className="word-preview-content word-preview-content-region"
                  dangerouslySetInnerHTML={{ __html: previewDocument.footerHtml }}
                />
              </div>
            </div>
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
      </div>
    </div>
  );
}
