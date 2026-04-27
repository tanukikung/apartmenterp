'use client';

import type { Editor } from '@tiptap/react';

type Block = {
  label: string;
  labelTh: string;
  html: string;
  color: string;
  bg: string;
  /** 'html' = insertContent (default), 'table' = insertTable */
  type?: 'html' | 'table';
};

const BLOCKS: Block[] = [
  {
    label: 'Notice',
    labelTh: 'กล่องแจ้งเตือน',
    color: '#8b5e00',
    bg: '#fff3cd',
    html: `<div style="background:#fff3cd;border:1.5px solid #f29d21;border-radius:8px;padding:14px 18px;">
  <div style="font-size:18px;font-weight:700;color:#8b5e00;">แจ้งเตือน</div>
  <div style="font-size:16px;color:#6b5500;margin-top:4px;">พิมพ์ข้อความที่นี่...</div>
</div>`,
  },
  {
    label: 'Success',
    labelTh: 'กล่องสำเร็จ',
    color: '#166534',
    bg: '#f0fdf4',
    html: `<div style="background:#f0fdf4;border:1.5px solid #22c55e;border-radius:8px;padding:14px 18px;">
  <div style="font-size:18px;font-weight:700;color:#166534;">สำเร็จ</div>
  <div style="font-size:16px;color:#166534;margin-top:4px;">พิมพ์ข้อความที่นี่...</div>
</div>`,
  },
  {
    label: 'Warning',
    labelTh: 'กล่องคำเตือน',
    color: '#991b1b',
    bg: '#fef2f2',
    html: `<div style="background:#fef2f2;border:1.5px solid #ef4444;border-radius:8px;padding:14px 18px;">
  <div style="font-size:18px;font-weight:700;color:#991b1b;">คำเตือน</div>
  <div style="font-size:16px;color:#991b1b;margin-top:4px;">พิมพ์ข้อความที่นี่...</div>
</div>`,
  },
  {
    label: 'Info',
    labelTh: 'กล่องหมายเหตุ',
    color: '#1e40af',
    bg: '#eff6ff',
    html: `<div style="background:#eff6ff;border:1.5px solid #3b82f6;border-radius:8px;padding:14px 18px;">
  <div style="font-size:18px;font-weight:700;color:#1e40af;">หมายเหตุ</div>
  <div style="font-size:16px;color:#1e40af;margin-top:4px;">พิมพ์ข้อความที่นี่...</div>
</div>`,
  },
  {
    label: 'Section',
    labelTh: 'เส้นแบ่งหัวข้อ',
    color: '#1c3860',
    bg: 'transparent',
    html: `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;">
  <div style="flex:1;height:1.5px;background:#1c3860;"></div>
  <span style="font-size:16px;font-weight:700;color:#1c3860;white-space:nowrap;">หัวข้อ</span>
  <div style="flex:1;height:1.5px;background:#1c3860;"></div>
</div>`,
  },
  {
    label: 'Table',
    labelTh: 'ตาราง 3 คอลัมน์',
    color: '#1c3860',
    bg: 'transparent',
    html: '',
    type: 'table',
  },
  {
    label: 'QR Transfer',
    labelTh: 'QR + ช่องโอน',
    color: '#1c3860',
    bg: 'transparent',
    html: `<div style="display:flex;gap:0;align-items:stretch;">
  <div style="flex:1;background:#f8fafc;border:1.5px solid #1c3860;border-right:none;border-radius:8px 0 0 8px;padding:14px 18px;">
    <div style="font-size:16px;font-weight:700;color:#1c3860;margin-bottom:8px;">ชำระด้วยการโอน / Bank Transfer</div>
    <div style="display:flex;gap:12px;font-size:16px;line-height:1.7;"><span style="color:#555;white-space:nowrap;min-width:80px;">ธนาคาร</span><span style="color:#1c3860;font-weight:700;">กสิกรไทย</span></div>
    <div style="display:flex;gap:12px;font-size:16px;line-height:1.7;"><span style="color:#555;white-space:nowrap;min-width:80px;">เลขที่บัญชี</span><span style="color:#1c3860;font-weight:700;">xxx-x-xxxxx-x</span></div>
  </div>
  <div style="background:#1c3860;color:#fff;border-radius:0 8px 8px 0;border:1.5px solid #1c3860;padding:16px 24px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;min-width:220px;text-align:center;">
    <span style="font-size:14px;color:#f29d21;font-weight:700;">รวมทั้งสิ้น / TOTAL</span>
    <span style="font-size:32px;font-weight:700;line-height:1;">฿X,XXX.XX</span>
  </div>
</div>`,
  },
  {
    label: 'Text Box',
    labelTh: 'ช่องข้อความ',
    color: '#1c3860',
    bg: '#fff',
    html: `<div style="background:#fff;border:2px solid #1c3860;border-radius:6px;padding:10px 14px;font-size:16px;color:#444;min-height:40px;">พิมพ์ข้อความ...</div>`,
  },
  {
    label: 'Page Number',
    labelTh: 'เบอร์หน้า',
    color: '#1c3860',
    bg: 'transparent',
    html: `<div style="display:flex;align-items:center;justify-content:center;gap:4px;font-size:14px;color:#666;padding:8px 0;">
  <span>หน้า</span>
  <span style="font-weight:700;color:#1c3860;">{{pageNumber}}</span>
  <span>/</span>
  <span style="font-weight:700;color:#1c3860;">{{totalPages}}</span>
</div>`,
  },
  {
    label: 'Divider',
    labelTh: 'เส้นแบ่ง',
    color: '#e0e0e8',
    bg: 'transparent',
    html: `<hr style="border:none;border-top:1.5px solid #e0e0e8;margin:16px 0;" />`,
  },
];

type Props = {
  activeEditor: Editor | null;
};

export function BlockPalette({ activeEditor }: Props) {
  function insertBlock(block: Block) {
    if (!activeEditor) return;
    if (block.type === 'table') {
      activeEditor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    } else {
      activeEditor.chain().focus().insertContent(block.html).run();
    }
  }

  return (
    <div className="block-palette">
      <div className="block-palette-label">แทรก</div>
      <div className="block-palette-scroll">
        {BLOCKS.map((block) => (
          <button
            key={block.label}
            type="button"
            className="block-palette-btn"
            onClick={() => insertBlock(block)}
            title={block.labelTh}
          >
            <div
              className="block-palette-preview"
              style={{
                background: block.bg,
                border: `1.5px solid ${block.color}`,
                borderRadius: 4,
              }}
            >
              {block.type === 'table' ? (
                <div className="flex gap-[2px] items-center justify-center p-1">
                  {[0, 1, 2].map((col) => (
                    <div
                      key={col}
                      className="w-4 rounded-[1px]"
                      style={{ background: block.color, height: 14 }}
                    />
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    width: 28,
                    height: block.label === 'Section' ? 2 : 18,
                    background: block.color,
                    borderRadius: block.label === 'Section' ? 0 : 2,
                    margin: '0 auto',
                  }}
                />
              )}
            </div>
            <span className="block-palette-name">{block.labelTh}</span>
          </button>
        ))}
      </div>
    </div>
  );
}