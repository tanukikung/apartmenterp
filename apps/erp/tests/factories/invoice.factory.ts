export async function createInvoiceFromBilling(billingRecordId: string) {
  const { getInvoiceService } = await import('@/modules/invoices/invoice.service');
  const svc = getInvoiceService();
  return svc.generateInvoiceFromBilling(billingRecordId);
}
