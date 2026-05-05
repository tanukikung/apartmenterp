import { sendTextWithQuickReply, type QuickReplyItem } from '@/lib/line/client';

export interface InvoiceTemplateData {
  roomNumber: string;
  amount: string;
  dueDate: string;
  invoiceNumber: string;
  paymentLink?: string;
}

export interface ReceiptTemplateData {
  roomNumber: string;
  amount: string;
  paidDate: string;
  invoiceNumber: string;
  downloadLink: string;
}

export { sendTextWithQuickReply, type QuickReplyItem };
export * from './lineTemplates';