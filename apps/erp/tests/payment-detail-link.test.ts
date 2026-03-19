import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { getPaymentInvoiceHref } from '@/app/admin/payments/payment-detail-links';

describe('Payment detail dead-path cleanup', () => {
  it('routes matched invoice affordances to the invoices list', () => {
    expect(getPaymentInvoiceHref()).toBe('/admin/invoices');
  });

  it('does not expose the dead unmatch action or broken invoice detail path in the page source', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/admin/payments/[paymentId]/page.tsx'),
      'utf8',
    );

    expect(pageSource).toContain('getPaymentInvoiceHref()');
    expect(pageSource).not.toContain('/unmatch');
    expect(pageSource).not.toContain('handleUnmatch');
    expect(pageSource).not.toContain('/admin/invoices/${payment.invoiceId}');
  });
});
