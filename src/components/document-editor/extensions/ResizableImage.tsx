'use client';

import Image from '@tiptap/extension-image';
import { mergeAttributes, type CommandProps } from '@tiptap/core';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type ImageAlign = 'left' | 'center' | 'right';

function resolveImageMargin(align: ImageAlign): string {
  switch (align) {
    case 'left':
      return '0 auto 0 0';
    case 'right':
      return '0 0 0 auto';
    default:
      return '0 auto';
  }
}

function clampWidth(value: number, maxWidth: number): number {
  return Math.max(160, Math.min(Math.round(value), Math.max(160, maxWidth)));
}

function ResizableImageView({ node, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState(false);
  const width = Number(node.attrs.width) || 640;
  const align = (node.attrs.align as ImageAlign | undefined) || 'center';

  useEffect(() => {
    if (!resizing) return;

    function stopResizing() {
      setResizing(false);
    }

    window.addEventListener('pointerup', stopResizing);
    window.addEventListener('pointercancel', stopResizing);
    return () => {
      window.removeEventListener('pointerup', stopResizing);
      window.removeEventListener('pointercancel', stopResizing);
    };
  }, [resizing]);

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = width;
    const wrapperWidth = frameRef.current?.closest('.word-editor-page')?.clientWidth ?? 880;
    const maxWidth = Math.max(240, wrapperWidth - 120);
    setResizing(true);

    function handleMove(moveEvent: PointerEvent) {
      const delta = moveEvent.clientX - startX;
      updateAttributes({
        width: clampWidth(startWidth + delta, maxWidth),
      });
    }

    function handleUp() {
      setResizing(false);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  }

  const frameStyle = useMemo(
    () => ({
      width: `${width}px`,
      maxWidth: '100%',
      margin: resolveImageMargin(align),
    }),
    [align, width],
  );

  return (
    <NodeViewWrapper className="word-image-node" data-selected={selected ? 'true' : 'false'}>
      <div ref={frameRef} className="word-image-frame" style={frameStyle} contentEditable={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={node.attrs.src as string}
          alt={(node.attrs.alt as string | undefined) || 'Document image'}
          title={(node.attrs.title as string | undefined) || ''}
          draggable={false}
        />

        {selected ? (
          <div className="word-image-toolbar">
            <button type="button" onClick={() => updateAttributes({ align: 'left' })}>
              Left
            </button>
            <button type="button" onClick={() => updateAttributes({ align: 'center' })}>
              Center
            </button>
            <button type="button" onClick={() => updateAttributes({ align: 'right' })}>
              Right
            </button>
            <button type="button" onClick={() => deleteNode()}>
              Remove
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="word-image-resize-handle"
          onPointerDown={beginResize}
          aria-label="Resize image"
        />
      </div>
      {resizing ? <div className="word-image-resize-indicator">{width}px</div> : null}
    </NodeViewWrapper>
  );
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setResizableImage: (options: {
        src: string;
        alt?: string;
        title?: string;
        width?: number;
        align?: ImageAlign;
      }) => ReturnType;
    };
  }
}

export const ResizableImage = Image.extend({
  name: 'resizableImage',
  group: 'block',
  inline: false,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 640,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-width') || element.getAttribute('width');
          const parsed = Number(raw);
          return Number.isFinite(parsed) ? parsed : 640;
        },
        renderHTML: (attributes) => ({
          'data-width': attributes.width,
          width: attributes.width,
        }),
      },
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes) => ({
          'data-align': attributes.align,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const align = (HTMLAttributes.align as ImageAlign | undefined) || 'center';
    const width = Number(HTMLAttributes.width) || 640;
    const style = [
      'display:block',
      `width:${width}px`,
      'max-width:100%',
      'height:auto',
      `margin:${resolveImageMargin(align)}`,
    ].join(';');

    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        style,
      }),
    ];
  },

  addCommands() {
    return {
      setResizableImage:
        (options) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              ...options,
              width: options.width ?? 640,
              align: options.align ?? 'center',
            },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
