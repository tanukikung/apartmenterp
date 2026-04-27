import { sendFlexMessage, type LineMessageOptions } from '@/lib';
import type { MessageAPIResponseBase } from '@line/bot-sdk';

export interface InvoiceTemplateData {
  roomNumber: string;
  amount: string;
  dueDate: string;
  invoiceNumber: string;
  paymentLink?: string;
  bankAccountNo?: string;
  bankName?: string;
  bankAccountName?: string;
  qrImageId?: string; // LINE CDN imageId for QR code
}

export interface ReminderTemplateData {
  roomNumber: string;
  amount: string;
  dueDate: string;
  daysOverdue?: number;
  paymentLink?: string;
}

export interface ReceiptTemplateData {
  roomNumber: string;
  amount: string;
  paidDate: string;
  invoiceNumber: string;
  receiptNumber?: string;
  downloadLink?: string;
}

export function buildInvoiceFlex(data: InvoiceTemplateData): object {
  return {
    type: 'bubble',
    hero: {
      type: 'image',
      url: 'https://static.line-scdn.net/liff/edge/commons/images/brand/logo.png',
      size: 'full',
      aspectRatio: '20:13',
      aspectMode: 'cover',
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '📄 ใบแจ้งหนี้', weight: 'bold', size: 'xl', color: '#1B4D4D' },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            { type: 'text', text: `🏠 ห้อง ${data.roomNumber}`, size: 'md', color: '#444444' },
            { type: 'text', text: `เลขที่ใบแจ้งหนี้ #${data.invoiceNumber}`, size: 'sm', color: '#888888' },
            { type: 'text', text: `💰 ยอดชำระ ${data.amount}`, size: 'md', weight: 'bold', color: '#D4AF37' },
            { type: 'text', text: `📅 กำหนดชำระ ${data.dueDate}`, size: 'sm', color: '#888888' },
          ],
        },
        ...(data.bankAccountNo || data.bankName ? [
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            paddingAll: 'md',
            backgroundColor: '#F5F5F5',
            cornerRadius: '8px',
            contents: [
              { type: 'text', text: '🏦 ข้อมูลบัญชีโอนเงิน', weight: 'bold', size: 'sm', color: '#555555' },
              ...(data.bankName ? [{ type: 'text', text: `ธนาคาร: ${data.bankName}`, size: 'sm', color: '#333333', margin: 'xs' }] : []),
              ...(data.bankAccountNo ? [{ type: 'text', text: `เลขบัญชี: ${data.bankAccountNo}`, size: 'sm', color: '#333333', margin: 'xs' }] : []),
              ...(data.bankAccountName ? [{ type: 'text', text: `ชื่อบัญชี: ${data.bankAccountName}`, size: 'sm', color: '#333333', margin: 'xs' }] : []),
              ...(data.qrImageId ? [
                {
                  type: 'image',
                  url: `https://api-data.line.me/v2/bot/message/${data.qrImageId}/content`,
                  size: 'md',
                  aspectRatio: '1:1',
                  margin: 'md',
                },
                { type: 'text', text: '📱 สแกน QR เพื่อชำระ', size: 'xs', color: '#888888', align: 'center', margin: 'xs' },
              ] : []),
            ],
          },
        ] : []),
      ],
    },
  };
}

export function buildReminderFlex(data: ReminderTemplateData): object {
  const overdue = data.daysOverdue && data.daysOverdue > 0 ? `Overdue: ${data.daysOverdue} day(s)` : undefined;
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'Payment Reminder', weight: 'bold', size: 'xl', color: '#EA4335' },
        { type: 'text', text: `Room ${data.roomNumber}`, size: 'md', margin: 'md' },
        { type: 'text', text: `Amount: ${data.amount}`, size: 'md', weight: 'bold' },
        { type: 'text', text: `Due: ${data.dueDate}`, size: 'sm', color: '#EA4335' },
        ...(overdue ? [{ type: 'text', text: overdue, size: 'sm', color: '#EA4335' }] : []),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        ...(data.paymentLink
          ? [
              {
                type: 'button',
                style: 'primary',
                action: { type: 'uri', label: 'Pay Now', uri: data.paymentLink },
              },
            ]
          : []),
      ],
      flex: 0,
    },
  };
}

export function buildReceiptFlex(data: ReceiptTemplateData): object {
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'Payment Receipt', weight: 'bold', size: 'xl', color: '#34A853' },
        { type: 'text', text: `Room ${data.roomNumber}`, size: 'md', margin: 'md' },
        { type: 'text', text: `Invoice #${data.invoiceNumber}`, size: 'sm', color: '#888888' },
        { type: 'text', text: `Amount: ${data.amount}`, size: 'md', weight: 'bold' },
        { type: 'text', text: `Paid: ${data.paidDate}`, size: 'sm' },
        ...(data.receiptNumber ? [{ type: 'text', text: `Receipt #${data.receiptNumber}`, size: 'sm' }] : []),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        ...(data.downloadLink
          ? [
              {
                type: 'button',
                style: 'primary',
                action: { type: 'uri', label: 'Download Receipt', uri: data.downloadLink },
              },
            ]
          : []),
      ],
      flex: 0,
    },
  };
}

export async function sendInvoiceMessage(
  userId: string,
  data: InvoiceTemplateData,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const alt = `Invoice ${data.invoiceNumber} - Room ${data.roomNumber} - ${data.amount} due ${data.dueDate}`;
  return sendFlexMessage(userId, alt, { type: 'carousel', contents: [buildInvoiceFlex(data)] }, options);
}

export async function sendReminderMessage(
  userId: string,
  data: ReminderTemplateData,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const alt = `Payment Reminder - Room ${data.roomNumber} - ${data.amount} due ${data.dueDate}`;
  return sendFlexMessage(userId, alt, { type: 'carousel', contents: [buildReminderFlex(data)] }, options);
}

export async function sendReceiptMessage(
  userId: string,
  data: ReceiptTemplateData,
  options: LineMessageOptions = {}
): Promise<MessageAPIResponseBase> {
  const alt = `Receipt - Room ${data.roomNumber} - ${data.amount} on ${data.paidDate}`;
  return sendFlexMessage(userId, alt, { type: 'carousel', contents: [buildReceiptFlex(data)] }, options);
}
