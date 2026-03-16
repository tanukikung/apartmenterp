import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'fs';
import { documentTemplateHtmlToText } from '@/lib/templates/document-template';
import { PDF_CONFIG } from '@/modules/invoices/pdf-config';

function wrapLine(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    lines.push(remaining.slice(0, maxChars));
    remaining = remaining.slice(maxChars);
  }
  return lines;
}

export async function generateDocumentPdf(title: string, html: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const regularBytes = readFileSync(PDF_CONFIG.fontPaths.regular());
  const boldBytes = readFileSync(PDF_CONFIG.fontPaths.bold());
  const font = await doc.embedFont(regularBytes);
  const bold = await doc.embedFont(boldBytes);

  let page = doc.addPage([PDF_CONFIG.page.width, PDF_CONFIG.page.height]);
  let y = 800;

  const addPage = () => {
    page = doc.addPage([PDF_CONFIG.page.width, PDF_CONFIG.page.height]);
    y = 800;
  };

  const drawText = (text: string, x: number, size: number, isBold: boolean = false) => {
    if (y < 60) addPage();
    page.drawText(text, {
      x,
      y,
      size,
      font: isBold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 6;
  };

  drawText(title, PDF_CONFIG.page.marginLeft, 20, true);
  drawText(new Date().toLocaleString('th-TH'), PDF_CONFIG.page.marginLeft, 10, false);
  y -= 4;
  page.drawLine({
    start: { x: PDF_CONFIG.page.marginLeft, y },
    end: { x: PDF_CONFIG.page.marginRight, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 16;

  const text = documentTemplateHtmlToText(html);
  text.split('\n').forEach((rawLine) => {
    if (!rawLine.trim()) {
      y -= 10;
      return;
    }

    wrapLine(rawLine, 55).forEach((line) => {
      drawText(line, PDF_CONFIG.page.marginLeft, 10);
    });
  });

  return doc.save();
}
