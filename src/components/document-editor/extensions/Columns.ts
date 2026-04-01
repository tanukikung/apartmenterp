import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Columns — wraps content in a CSS multi-column block (2 or 3 columns).
 * Usage: click "2 Col" / "3 Col" to wrap selection in a column block.
 */
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (element) =>
          parseInt(element.getAttribute('data-columns') ?? '2', 10),
        renderHTML: (attrs) => ({ 'data-columns': String(attrs.count) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-columns]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'template-columns' }), 0];
  },
});
