import { z } from 'zod';

export const createDeliveryOrderSchema = z.object({
  documentType: z.enum(['INVOICE', 'RECEIPT', 'NOTICE', 'CONTRACT', 'GENERAL', 'REPORT']),
  description: z.string().optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  floorNumber: z.number().int().optional(),
  roomNos: z.array(z.string()).optional(),
  sendNow: z.boolean().default(false),
});

export const deliveryOrderListQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  status: z.enum(['DRAFT', 'SENDING', 'COMPLETED', 'PARTIAL', 'FAILED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateDeliveryOrderInput = z.infer<typeof createDeliveryOrderSchema>;
export type DeliveryOrderListQuery = z.infer<typeof deliveryOrderListQuerySchema>;
