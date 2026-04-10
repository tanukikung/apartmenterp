import { Extension } from '@tiptap/core';

/** Line height values mapped to CSS string */
const LINE_HEIGHTS: Record<string, string> = {
  '1': '1',
  '1.15': '1.15',
  '1.5': '1.5',
  '1.75': '1.75',
  '2': '2',
  '2.5': '2.5',
};

/** Paragraph spacing values mapped to pt */
const PARAGRAPH_SPACING: Record<string, string> = {
  '0': '0',
  '6': '6pt',
  '12': '12pt',
  '18': '18pt',
  '24': '24pt',
};

function cssLineHeight(value: string): string {
  return LINE_HEIGHTS[value] ?? 'inherit';
}

function cssParagraphSpacing(value: string): string {
  const pt = PARAGRAPH_SPACING[value] ?? value;
  return pt === '0' ? '0' : `${pt}`;
}

export const LineSpacing = Extension.create({
  name: 'lineSpacing',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) =>
              element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {};
              return { style: `line-height: ${cssLineHeight(attributes.lineHeight)}` };
            },
          },
          paragraphSpacing: {
            default: null,
            parseHTML: (element) =>
              element.style.marginBottom || null,
            renderHTML: (attributes) => {
              if (!attributes.paragraphSpacing) return {};
              const val = cssParagraphSpacing(attributes.paragraphSpacing);
              return { style: `margin-bottom: ${val}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (value: string) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ commands }: any) => {
          return commands.updateAttributes('paragraph', { lineHeight: value });
        },

      unsetLineHeight:
        () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ commands }: any) => {
          return commands.updateAttributes('paragraph', { lineHeight: null });
        },

      setParagraphSpacing:
        (value: string) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ commands }: any) => {
          return commands.updateAttributes('paragraph', { paragraphSpacing: value });
        },
    };
  },
});
