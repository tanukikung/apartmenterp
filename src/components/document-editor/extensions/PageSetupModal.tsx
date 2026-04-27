'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import {
  type TemplateDocumentMeta,
  type TemplateFontFamily,
  type TemplateFontSize,
  type TemplateLineHeight,
  type TemplateMarginPreset,
  type TemplateOrientation,
  type TemplatePageSize,
} from '@/lib/templates/document-template';

type Props = {
  layout: TemplateDocumentMeta;
  onSave: (layout: TemplateDocumentMeta) => void;
  onClose: () => void;
};

const MARGIN_PRESETS: Record<Exclude<TemplateMarginPreset, 'custom'>, number> = {
  narrow: 14,
  normal: 18,
  wide: 24,
};

const PAGE_SIZES: { value: TemplatePageSize; label: string; sub: string; wMm: number; hMm: number }[] = [
  { value: 'A5', label: 'A5', sub: '148 × 210 mm', wMm: 148, hMm: 210 },
  { value: 'A4', label: 'A4', sub: '210 × 297 mm', wMm: 210, hMm: 297 },
  { value: 'A3', label: 'A3', sub: '297 × 420 mm', wMm: 297, hMm: 420 },
  { value: 'LETTER', label: 'Letter', sub: '8.5 × 11 in', wMm: 216, hMm: 279 },
  { value: 'LEGAL', label: 'Legal', sub: '8.5 × 14 in', wMm: 216, hMm: 356 },
  { value: 'CUSTOM', label: 'กำหนดเอง', sub: 'ระบุขนาดเอง', wMm: 0, hMm: 0 },
];

const ORIENTATIONS: { value: TemplateOrientation; label: string; icon: string }[] = [
  { value: 'PORTRAIT', label: 'แนวตั้ง', icon: '▯' },
  { value: 'LANDSCAPE', label: 'แนวนอน', icon: '▭' },
];

const FONT_FAMILIES: { value: TemplateFontFamily; label: string }[] = [
  { value: 'sarabun', label: 'สารบาญ (Sarabun)' },
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
];

const FONT_SIZES: { value: TemplateFontSize; label: string; px: string }[] = [
  { value: 'sm', label: 'S', px: '14px' },
  { value: 'base', label: 'M', px: '15px' },
  { value: 'lg', label: 'L', px: '17px' },
];

const LINE_HEIGHTS: { value: TemplateLineHeight; label: string }[] = [
  { value: 'normal', label: '1.0' },
  { value: 'relaxed', label: '1.5' },
  { value: 'loose', label: '1.75' },
];

function PaperMiniature({
  pageSize,
  orientation,
  marginMm,
  customWidthMm,
  customHeightMm,
}: {
  pageSize: TemplatePageSize;
  orientation: TemplateOrientation;
  marginMm: number;
  customWidthMm?: number;
  customHeightMm?: number;
}) {
  const sizeInfo = PAGE_SIZES.find((s) => s.value === pageSize) ?? PAGE_SIZES[1];
  const wMm = pageSize === 'CUSTOM' ? (customWidthMm ?? 210) : sizeInfo.wMm;
  const hMm = pageSize === 'CUSTOM' ? (customHeightMm ?? 297) : sizeInfo.hMm;

  const isPortrait = orientation === 'PORTRAIT';
  const maxW = 160;
  const ratio = wMm / hMm;
  const svgW = isPortrait ? maxW : maxW * ratio;
  const svgH = isPortrait ? maxW / ratio : maxW;

  const m = (marginMm / wMm) * svgW;
  const innerX = m;
  const innerY = m;
  const innerW = svgW - m * 2;
  const innerH = svgH - m * 2;

  const label = pageSize === 'CUSTOM' ? `${wMm}×${hMm}mm` : pageSize;

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ display: 'block', borderRadius: 2 }}>
      <rect x={0} y={0} width={svgW} height={svgH} fill="white" stroke="#1c3860" strokeWidth={1.5} />
      {isPortrait ? (
        <>
          <rect x={0} y={0} width={svgW} height={m} fill="#3b82f6" opacity={0.12} />
          <rect x={0} y={svgH - m} width={svgW} height={m} fill="#3b82f6" opacity={0.12} />
          <rect x={0} y={m} width={m} height={innerH} fill="#3b82f6" opacity={0.12} />
          <rect x={svgW - m} y={m} width={m} height={innerH} fill="#3b82f6" opacity={0.12} />
          <rect x={innerX} y={innerY} width={innerW} height={innerH} fill="none" stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="2,2" opacity={0.4} />
        </>
      ) : (
        <>
          <rect x={0} y={0} width={m} height={svgH} fill="#3b82f6" opacity={0.12} />
          <rect x={svgW - m} y={0} width={m} height={svgH} fill="#3b82f6" opacity={0.12} />
          <rect x={m} y={0} width={innerW} height={m} fill="#3b82f6" opacity={0.12} />
          <rect x={m} y={svgH - m} width={innerW} height={m} fill="#3b82f6" opacity={0.12} />
          <rect x={innerX} y={innerY} width={innerW} height={innerH} fill="none" stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="2,2" opacity={0.4} />
        </>
      )}
      <text x={svgW / 2} y={svgH / 2} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize={Math.min(svgW, svgH) * 0.07} fontFamily="sans-serif">
        {label} {orientation === 'LANDSCAPE' ? '⊔' : '▯'}
      </text>
    </svg>
  );
}

export function PageSetupModal({ layout, onSave, onClose }: Props) {
  const [pageSize, setPageSize] = useState<TemplatePageSize>(layout.pageSize);
  const [orientation, setOrientation] = useState<TemplateOrientation>(layout.orientation);
  const [marginPreset, setMarginPreset] = useState<TemplateMarginPreset>(layout.marginPreset);
  const [fontFamily, setFontFamily] = useState<TemplateFontFamily>(layout.fontFamily);
  const [fontSize, setFontSize] = useState<TemplateFontSize>(layout.fontSize);
  const [lineHeight, setLineHeight] = useState<TemplateLineHeight>(layout.lineHeight);
  const [headerEnabled, setHeaderEnabled] = useState(true);
  const [footerEnabled, setFooterEnabled] = useState(true);

  // Custom margin (all 4 sides)
  const [customTop, setCustomTop] = useState(layout.customMarginTopMm ?? 18);
  const [customBottom, setCustomBottom] = useState(layout.customMarginBottomMm ?? 18);
  const [customLeft, setCustomLeft] = useState(layout.customMarginLeftMm ?? 18);
  const [customRight, setCustomRight] = useState(layout.customMarginRightMm ?? 18);

  // Custom page size
  const [customWidth, setCustomWidth] = useState(layout.customWidthMm ?? 210);
  const [customHeight, setCustomHeight] = useState(layout.customHeightMm ?? 297);

  const effectiveTop = marginPreset === 'custom' ? customTop : MARGIN_PRESETS[marginPreset];
  const selectedSize = PAGE_SIZES.find((s) => s.value === pageSize) ?? PAGE_SIZES[1];
  const displayW = pageSize === 'CUSTOM' ? customWidth : selectedSize.wMm;
  const displayH = pageSize === 'CUSTOM' ? customHeight : selectedSize.hMm;

  function handleSave() {
    const meta: TemplateDocumentMeta = {
      pageSize,
      orientation,
      marginPreset,
      fontFamily,
      fontSize,
      lineHeight,
    };
    if (pageSize === 'CUSTOM') {
      meta.customWidthMm = customWidth;
      meta.customHeightMm = customHeight;
    }
    if (marginPreset === 'custom') {
      meta.customMarginTopMm = customTop;
      meta.customMarginBottomMm = customBottom;
      meta.customMarginLeftMm = customLeft;
      meta.customMarginRightMm = customRight;
    }
    onSave(meta);
  }

  return (
    <div
      className="page-setup-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="page-setup-modal">
        <div className="page-setup-header">
          <div className="page-setup-title">ตั้งค่าหน้ากระดาษ</div>
          <button type="button" onClick={onClose} className="page-setup-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="page-setup-body">
          {/* Left: Miniature */}
          <div className="page-setup-preview">
            <div className="page-setup-preview-label">ตัวอย่าง</div>
            <div className="page-setup-miniature-wrap">
              <PaperMiniature
                pageSize={pageSize}
                orientation={orientation}
                marginMm={effectiveTop}
                customWidthMm={customWidth}
                customHeightMm={customHeight}
              />
            </div>
            <div className="page-setup-margin-info">
              ขอบ {effectiveTop}mm
            </div>
          </div>

          {/* Right: Controls */}
          <div className="page-setup-controls">

            {/* Paper Size */}
            <div className="page-setup-section">
              <div className="page-setup-section-label">ขนาดกระดาษ</div>
              <div className="page-setup-grid-3">
                {PAGE_SIZES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`page-setup-toggle-btn ${pageSize === s.value ? 'active' : ''}`}
                    onClick={() => setPageSize(s.value)}
                  >
                    <span className="page-setup-toggle-label">{s.label}</span>
                    <span className="page-setup-toggle-sub">{s.sub}</span>
                  </button>
                ))}
              </div>

              {pageSize === 'CUSTOM' && (
                <div className="page-setup-custom-size">
                  <div className="page-setup-custom-row">
                    <label className="page-setup-custom-label">กว้าง</label>
                    <input type="number" className="page-setup-custom-input" value={customWidth} min={50} max={500} onChange={(e) => setCustomWidth(Number(e.target.value))} />
                    <span className="page-setup-custom-unit">mm</span>
                  </div>
                  <div className="page-setup-custom-row">
                    <label className="page-setup-custom-label">สูง</label>
                    <input type="number" className="page-setup-custom-input" value={customHeight} min={50} max={600} onChange={(e) => setCustomHeight(Number(e.target.value))} />
                    <span className="page-setup-custom-unit">mm</span>
                  </div>
                </div>
              )}
            </div>

            {/* Orientation */}
            <div className="page-setup-section">
              <div className="page-setup-section-label">แนวกระดาษ</div>
              <div className="page-setup-toggle-row">
                {ORIENTATIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`page-setup-orientation-btn ${orientation === o.value ? 'active' : ''}`}
                    onClick={() => setOrientation(o.value)}
                  >
                    <span className="page-setup-orientation-icon">{o.icon}</span>
                    <span>{o.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Margins */}
            <div className="page-setup-section">
              <div className="page-setup-section-label">ขอบกระดาษ</div>
              <div className="page-setup-preset-row">
                {(['narrow', 'normal', 'wide'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`page-setup-preset-pill ${marginPreset === preset ? 'active' : ''}`}
                    onClick={() => setMarginPreset(preset)}
                  >
                    {preset === 'narrow' ? 'แคบ' : preset === 'normal' ? 'ปกติ' : 'กว้าง'} {MARGIN_PRESETS[preset]}mm
                  </button>
                ))}
                <button
                  type="button"
                  className={`page-setup-preset-pill ${marginPreset === 'custom' ? 'active' : ''}`}
                  onClick={() => setMarginPreset('custom')}
                >
                  กำหนดเอง
                </button>
              </div>

              {marginPreset === 'custom' && (
                <div className="page-setup-custom-margins">
                  <div className="page-setup-custom-row">
                    <label className="page-setup-custom-label">บน</label>
                    <input type="number" className="page-setup-custom-input" value={customTop} min={3} max={80} onChange={(e) => setCustomTop(Number(e.target.value))} />
                    <span className="page-setup-custom-unit">mm</span>
                  </div>
                  <div className="page-setup-custom-row">
                    <label className="page-setup-custom-label">ล่าง</label>
                    <input type="number" className="page-setup-custom-input" value={customBottom} min={3} max={80} onChange={(e) => setCustomBottom(Number(e.target.value))} />
                    <span className="page-setup-custom-unit">mm</span>
                  </div>
                  <div className="page-setup-custom-row">
                    <label className="page-setup-custom-label">ซ้าย</label>
                    <input type="number" className="page-setup-custom-input" value={customLeft} min={3} max={80} onChange={(e) => setCustomLeft(Number(e.target.value))} />
                    <span className="page-setup-custom-unit">mm</span>
                  </div>
                  <div className="page-setup-custom-row">
                    <label className="page-setup-custom-label">ขวา</label>
                    <input type="number" className="page-setup-custom-input" value={customRight} min={3} max={80} onChange={(e) => setCustomRight(Number(e.target.value))} />
                    <span className="page-setup-custom-unit">mm</span>
                  </div>
                </div>
              )}
            </div>

            {/* Font */}
            <div className="page-setup-section">
              <div className="page-setup-section-label">ฟอนต์</div>
              <div className="page-setup-toggle-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {FONT_FAMILIES.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    className={`page-setup-preset-pill ${fontFamily === f.value ? 'active' : ''}`}
                    onClick={() => setFontFamily(f.value)}
                    style={{ fontFamily: f.value === 'sarabun' ? "'Sarabun', sans-serif" : f.value === 'serif' ? 'Georgia, serif' : 'inherit' }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="page-setup-section">
              <div className="page-setup-section-label">ขนาดอักษร</div>
              <div className="page-setup-toggle-row">
                {FONT_SIZES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`page-setup-preset-pill ${fontSize === s.value ? 'active' : ''}`}
                    onClick={() => setFontSize(s.value)}
                  >
                    {s.label} {s.px}
                  </button>
                ))}
              </div>
            </div>

            {/* Line Spacing */}
            <div className="page-setup-section">
              <div className="page-setup-section-label">ระยะบรรทัด</div>
              <div className="page-setup-toggle-row">
                {LINE_HEIGHTS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    className={`page-setup-preset-pill ${lineHeight === l.value ? 'active' : ''}`}
                    onClick={() => setLineHeight(l.value)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Header / Footer */}
            <div className="page-setup-section">
              <div className="page-setup-section-label">ส่วนหัว/ท้าย</div>
              <div className="page-setup-toggle-row">
                <button type="button" className={`page-setup-preset-pill ${headerEnabled ? 'active' : ''}`} onClick={() => setHeaderEnabled(!headerEnabled)}>
                  Header {headerEnabled ? '✓' : '✗'}
                </button>
                <button type="button" className={`page-setup-preset-pill ${footerEnabled ? 'active' : ''}`} onClick={() => setFooterEnabled(!footerEnabled)}>
                  Footer {footerEnabled ? '✓' : '✗'}
                </button>
              </div>
            </div>

            {/* Page dimensions display */}
            <div className="page-setup-section">
              <div className="page-setup-dim-info">
                {displayW} × {displayH} mm
                {orientation === 'LANDSCAPE' ? ' (แนวนอน)' : ' (แนวตั้ง)'}
              </div>
            </div>
          </div>
        </div>

        <div className="page-setup-footer">
          <button type="button" className="page-setup-cancel-btn" onClick={onClose}>ยกเลิก</button>
          <button type="button" className="page-setup-save-btn" onClick={handleSave}>บันทึก</button>
        </div>
      </div>
    </div>
  );
}