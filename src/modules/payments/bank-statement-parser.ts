import * as XLSX from 'xlsx';
import { logger } from '@/lib/utils/logger';
import type { BankStatementEntry } from './payment-matching.service';

/**
 * Sanitize bank statement text fields to prevent XSS and homograph attacks.
 * 1. NFC normalize to canonical composition form (prevents homoglyph spoofing)
 * 2. Strip HTML tags (prevents script injection via Excel cells with HTML content)
 */
function sanitizeBankText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // NFC normalize then strip any HTML tag content
  return value.normalize('NFC').replace(/<[^>]*>/g, '').trim() || undefined;
}

export interface ParseOptions {
  dateColumn?: string;
  timeColumn?: string;
  amountColumn?: string;
  descriptionColumn?: string;
  referenceColumn?: string;
  dateFormat?: string;
  skipRows?: number;
}

export class BankStatementParser {
  parseCSV(csvContent: string, options: ParseOptions = {}): BankStatementEntry[] {
    try {
      const workbook = XLSX.read(csvContent, { type: 'string' });
      return this.parseWorkbook(workbook, options);
    } catch (error) {
      logger.error({
        type: 'bank_csv_parse_failed',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Invalid CSV format');
    }
  }

  parseExcel(buffer: Buffer, options: ParseOptions = {}): BankStatementEntry[] {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      return this.parseWorkbook(workbook, options);
    } catch (error) {
      logger.error({
        type: 'bank_excel_parse_failed',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw new Error('Invalid Excel format');
    }
  }

  private parseWorkbook(workbook: XLSX.WorkBook, options: ParseOptions): BankStatementEntry[] {
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet) as Array<Record<string, unknown>>;

    if (data.length === 0) {
      throw new Error('Empty worksheet');
    }

    const entries: BankStatementEntry[] = [];
    const startRow = options.skipRows || 0;

    // Auto-detect column names if not provided
    const headers = this.detectHeaders(data[0]);
    const dateCol = options.dateColumn || headers.date;
    const timeCol = options.timeColumn || headers.time;
    const amountCol = options.amountColumn || headers.amount;
    const descCol = options.descriptionColumn || headers.description;
    const refCol = options.referenceColumn || headers.reference;

    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      
      try {
        const entry = this.parseRow(row, {
          dateCol,
          timeCol,
          amountCol,
          descCol,
          refCol,
          dateFormat: options.dateFormat,
        });

        if (entry && entry.amount !== 0) { // Skip zero amount entries
          entries.push(entry);
        }
      } catch (error) {
        logger.warn({
          type: 'bank_row_parse_failed',
          row,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other rows
      }
    }

    logger.info({
      type: 'bank_statement_parsed',
      totalEntries: entries.length,
    });
    return entries;
  }

  private detectHeaders(firstRow: Record<string, unknown>): {
    date: string;
    time?: string;
    amount: string;
    description?: string;
    reference?: string;
  } {
    const headers = Object.keys(firstRow);
    const result = {
      date: '',
      time: '',
      amount: '',
      description: '',
      reference: '',
    };

    for (const header of headers) {
      const lowerHeader = header.toLowerCase();
      
      if (lowerHeader.includes('date') || lowerHeader.includes('วันที่')) {
        result.date = header;
      } else if (lowerHeader.includes('time') || lowerHeader.includes('เวลา')) {
        result.time = header;
      } else if (lowerHeader.includes('amount') || lowerHeader.includes('จำนวนเงิน') || 
                 lowerHeader.includes('debit') || lowerHeader.includes('credit') ||
                 lowerHeader.includes('withdraw') || lowerHeader.includes('deposit')) {
        result.amount = header;
      } else if (lowerHeader.includes('description') || lowerHeader.includes('รายละเอียด') ||
                 lowerHeader.includes('detail') || lowerHeader.includes('narrative')) {
        result.description = header;
      } else if (lowerHeader.includes('reference') || lowerHeader.includes('เลขที่อ้างอิง') ||
                 lowerHeader.includes('ref')) {
        result.reference = header;
      }
    }

    if (!result.date || !result.amount) {
      throw new Error('Could not detect required columns (date, amount)');
    }

    return result;
  }

  private parseRow(
    row: Record<string, unknown>,
    columns: {
      dateCol: string;
      timeCol?: string;
      amountCol: string;
      descCol?: string;
      refCol?: string;
      dateFormat?: string;
    }
  ): BankStatementEntry | null {
    const dateValue = row[columns.dateCol] as unknown;
    const amountValue = row[columns.amountCol] as unknown;

    if (!dateValue || amountValue === undefined || amountValue === null) {
      return null;
    }

    let date!: Date;
    
    // Parse date
    if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === 'number') {
      // Excel serial date
      date = this.excelDateToJSDate(dateValue);
    } else {
      // String date
      const dateStr = dateValue.toString().trim();
      
      // Try common Thai bank date formats
      const dateFormats = [
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // DD/MM/YYYY
        /^(\d{1,2})-(\d{1,2})-(\d{4})$/,   // DD-MM-YYYY
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, // YYYY/MM/DD
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/,   // YYYY-MM-DD
      ];

      let parsed = false;
      for (const format of dateFormats) {
        const match = dateStr.match(format);
        if (match) {
          const [, d, m, y] = match;
          const day = parseInt(d);
          const month = parseInt(m);
          const year = parseInt(y);
          
          if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            date = new Date(year, month - 1, day);
            parsed = true;
            break;
          }
        }
      }

      if (!parsed) {
        // Try direct Date parsing
        date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date format: ${dateStr}`);
        }
      }
    }

    // Parse amount
    let amount: number;
    if (typeof amountValue === 'number') {
      amount = amountValue;
    } else {
      const amountStr = amountValue.toString().replace(/[,\s]/g, '');
      amount = parseFloat(amountStr);
      if (isNaN(amount)) {
        throw new Error(`Invalid amount: ${amountValue}`);
      }
    }

    // Parse time if available
    let time: string | undefined;
    if (columns.timeCol && row[columns.timeCol]) {
      time = (row[columns.timeCol] as unknown as string).toString().trim();
    }

    return {
      date,
      time,
      amount,
      description: columns.descCol ? sanitizeBankText((row[columns.descCol] as unknown as string | undefined)?.toString().trim()) : undefined,
      reference: columns.refCol ? sanitizeBankText((row[columns.refCol] as unknown as string | undefined)?.toString().trim()) : undefined,
    };
  }

  private excelDateToJSDate(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    
    const fractionalDay = serial - Math.floor(serial) + 0.0000001;
    let totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    totalSeconds -= seconds;
    const hours = Math.floor(totalSeconds / (60 * 60));
    const minutes = Math.floor(totalSeconds / 60) % 60;
    
    return new Date(dateInfo.getFullYear(), dateInfo.getMonth(), dateInfo.getDate(), hours, minutes, seconds);
  }
}

export const bankStatementParser = new BankStatementParser();
