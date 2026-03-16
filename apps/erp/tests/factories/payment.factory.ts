export async function createPaymentForInvoice(invoiceId: string, amount: number) {
  const { getPaymentService } = await import('@/modules/payments/payment.service');
  const svc = getPaymentService();
  return svc.createPayment({
    invoiceId,
    amount,
    method: 'PROMPTPAY',
    referenceNumber: `REF-${Math.floor(Math.random() * 1000000)}`,
  } as any);
}
