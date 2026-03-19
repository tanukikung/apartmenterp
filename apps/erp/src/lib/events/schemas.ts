import { z } from 'zod';
import { EventTypes } from './types';

// Helper: date from ISO string or Date
const zDateFromString = z.preprocess((val) => {
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? val : d;
  }
  return val;
}, z.date());

export const EventPayloadSchemas: Record<string, z.ZodTypeAny> = {
  [EventTypes.INVOICE_GENERATED]: z.object({
    invoiceId: z.string().uuid(),
    roomId: z.string().uuid(),
    roomNumber: z.string(),
    billingRecordId: z.string().uuid(),
    year: z.number().int(),
    month: z.number().int(),
    version: z.number().int(),
    subtotal: z.number(),
    total: z.number().optional(),
    dueDate: z.union([z.string(), zDateFromString]),
  }),
  [EventTypes.INVOICE_PAID]: z.object({
    invoiceId: z.string().uuid(),
    paymentId: z.string().uuid(),
    paidAt: z.union([z.string(), zDateFromString]),
    amount: z.number(),
  }),
  [EventTypes.PAYMENT_CONFIRMED]: z.object({
    paymentId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    confirmedBy: z.string().optional(),
    confirmedAt: z.union([z.string(), zDateFromString]).optional(),
  }),
  [EventTypes.BILLING_LOCKED]: z.object({
    billingRecordId: z.string().uuid(),
    roomId: z.string().uuid(),
    roomNumber: z.string(),
    year: z.number().int(),
    month: z.number().int(),
    totalAmount: z.number(),
    lockedBy: z.string().optional(),
  }),
  // Messaging: File send (admin initiated)
  LineSendFileRequested: z.object({
    conversationId: z.string().min(1),
    messageId: z.string().uuid(),
    lineUserId: z.string(),
    fileUrl: z.string().url(),
    contentType: z.string(),
    name: z.string(),
  }),
  // Messaging: Invoice link send
  InvoiceSendRequested: z.object({
    invoiceId: z.string().uuid(),
    pdfUrl: z.string().url(),
    roomId: z.string().uuid().optional(),
    roomNumber: z.string().optional(),
    totalAmount: z.number().optional(),
    dueDate: z.union([z.string(), zDateFromString]).nullable().optional(),
  }),
  // Messaging: Receipt link send
  ReceiptSendRequested: z.object({
    receiptId: z.string().uuid(),
    conversationId: z.string().min(1),
    downloadLink: z.string().url().optional(),
    roomNumber: z.string().optional(),
    amount: z.number().optional(),
    paidDate: z.union([z.string(), zDateFromString]).optional(),
  }),
  // Messaging: Manual reminder
  ManualReminderSendRequested: z.object({
    conversationId: z.string().min(1),
    text: z.string().min(1),
  }),
};

export function validateEventPayload(eventType: string, payload: Record<string, unknown>): void {
  const schema = EventPayloadSchemas[eventType];
  if (!schema) return;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid payload for ${eventType}: ${parsed.error.message}`);
  }
}
