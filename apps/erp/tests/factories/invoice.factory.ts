export async function createInvoiceFromBilling(billingRecordId: string) {
  const { createInvoiceService } = await import('@/modules/invoices/invoice.service');
  const svc = createInvoiceService();
  return svc.generateInvoiceFromBilling(billingRecordId);
}
