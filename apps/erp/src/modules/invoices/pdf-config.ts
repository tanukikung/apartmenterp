/**
 * pdf-config.ts — single source of truth for PDF rendering constants.
 *
 * ALL PDF generation code (pdf.ts and invoice-pdf.service.ts) MUST import
 * font paths and layout constants from here so that the Thai-safe font is
 * never accidentally substituted with a WinAnsi StandardFont.
 *
 * Font notes:
 *  - NotoSansThai is an OFL-licensed Google Font with correct Thai shaping,
 *    including proper ำ (U+0E33 SARA AM) glyph rendering without the trailing
 *    า artifact that Sarabun exhibits when used with pdf-lib + fontkit.
 *  - StandardFonts.Helvetica (and all other pdf-lib built-ins) use WinAnsi
 *    encoding which stops at U+00FF — Thai characters crash at render time.
 *  - The TTF files live at:  apps/erp/public/fonts/NotoSansThai-{Regular,Bold}.ttf
 *  - Fallback: if NotoSansThai files are absent, Sarabun-{Regular,Bold}.ttf is used.
 */
import { join } from 'path';
import { existsSync } from 'fs';

function resolveFontPath(name: 'regular' | 'bold'): string {
  const noto = join(
    process.cwd(), 'public', 'fonts',
    name === 'bold' ? 'NotoSansThai-Bold.ttf' : 'NotoSansThai-Regular.ttf',
  );
  if (existsSync(noto)) return noto;
  // Fallback to Sarabun (has ำ rendering artefact but still usable)
  return join(
    process.cwd(), 'public', 'fonts',
    name === 'bold' ? 'Sarabun-Bold.ttf' : 'Sarabun-Regular.ttf',
  );
}

export const PDF_CONFIG = {
  /**
   * Absolute paths to the Thai TTF files.
   * Functions (not strings) so that process.cwd() is evaluated at call time,
   * which is important in both dev (cwd = apps/erp) and production builds.
   */
  fontPaths: {
    regular: (): string => resolveFontPath('regular'),
    bold:    (): string => resolveFontPath('bold'),
  },

  /** A4 page dimensions in PDF points. */
  page: {
    width:       595.28,
    height:      841.89,
    marginLeft:  50,
    marginRight: 545,
  },

  /**
   * Maximum characters per notes line for Thai-safe hard-wrap at 9pt.
   * Thai text has no word-break spaces so we use a fixed char-count wrap.
   * 45 chars fits within the left/right margin band at 9pt Sarabun.
   */
  notesMaxCharsPerLine: 45,
} as const;
