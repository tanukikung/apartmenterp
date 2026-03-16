/**
 * pdf-config.ts — single source of truth for PDF rendering constants.
 *
 * ALL PDF generation code (pdf.ts and invoice-pdf.service.ts) MUST import
 * font paths and layout constants from here so that the Thai-safe Sarabun
 * font is never accidentally substituted with a WinAnsi StandardFont.
 *
 * Font notes:
 *  - Sarabun is an OFL-licensed Google Font that covers Latin (U+0000–U+00FF)
 *    AND Thai (U+0E01–U+0E5B) in a single TTF file.
 *  - StandardFonts.Helvetica (and all other pdf-lib built-ins) use WinAnsi
 *    encoding which stops at U+00FF — Thai characters crash at render time.
 *  - The TTF files live at:  apps/erp/public/fonts/Sarabun-{Regular,Bold}.ttf
 */
import { join } from 'path';

export const PDF_CONFIG = {
  /**
   * Absolute paths to the bundled Sarabun TTF files.
   * Functions (not strings) so that process.cwd() is evaluated at call time,
   * which is important in both dev (cwd = apps/erp) and production builds.
   */
  fontPaths: {
    regular: (): string => join(process.cwd(), 'public', 'fonts', 'Sarabun-Regular.ttf'),
    bold:    (): string => join(process.cwd(), 'public', 'fonts', 'Sarabun-Bold.ttf'),
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
