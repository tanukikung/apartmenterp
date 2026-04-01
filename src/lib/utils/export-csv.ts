/**
 * exportToCsv
 *
 * Builds a UTF-8 CSV string with a BOM prefix so Thai characters render
 * correctly when opened directly in Microsoft Excel.
 *
 * @param filename  Desired filename (without extension — .csv is appended automatically)
 * @param rows      Array of plain objects to export
 * @param columns   Column definitions: which key to read and what header to write
 */

export interface CsvColumn {
  key: string;
  header: string;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    return value.toLocaleDateString('th-TH');
  }

  // ISO date strings (e.g. "2024-01-15T00:00:00.000Z")
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleDateString('th-TH');
  }

  if (typeof value === 'number') {
    return String(value);
  }

  const str = String(value);
  // Escape double-quotes by doubling them; wrap field in quotes if it
  // contains commas, quotes, or newlines.
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns: CsvColumn[],
): void {
  if (typeof window === 'undefined') return;
  if (rows.length === 0) return;

  try {
    const header = columns.map((c) => formatCell(c.header)).join(',');
    const body = rows
      .map((row) => columns.map((c) => formatCell(row[c.key])).join(','))
      .join('\r\n');

    // BOM (\uFEFF) ensures Excel reads the file as UTF-8 (required for Thai)
    const csvContent = '\uFEFF' + header + '\r\n' + body;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();

    // Clean up
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (err) {
    console.error('[export-csv] failed', { filename, error: err instanceof Error ? err.message : String(err) });
    // Surface a user-visible error via alert as a last resort
    // (avoids silent failure when Blob or download is blocked)
    if (typeof window !== 'undefined') {
      window.alert('Unable to download CSV. Please try again or check your browser settings.');
    }
  }
}
