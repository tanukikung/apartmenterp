import { z } from 'zod';

export interface CreatePaymentInput {
  invoiceId: string;
  amount: number;
  method: string;
  referenceNumber?: string;
  paidAt?: string;
}

export interface PaymentMatchInput {
  transactionId: string;
  invoiceId: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matchCriteria: {
    type: 'invoice_number' | 'reference' | 'amount_room' | 'amount_resident';
    matchedField: string;
    expectedValue: string;
    actualValue: string;
  };
}

export interface BankStatementUpload {
  file: File;
  autoMatch?: boolean;
}

export const createPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.string().min(1),
  referenceNumber: z.string().optional(),
  paidAt: z.string().optional(),
});
