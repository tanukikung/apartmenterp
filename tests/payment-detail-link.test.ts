import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { getPaymentInvoiceHref } from '@/app/admin/payments/payment-detail-links';

describe('Payment detail invoice links', () => {
  it('routes to the correct invoice detail page', () => {
    expect(getPaymentInvoiceHref('inv_abc123')).toBe('/admin/invoices/inv_abc123');
  });

  it('does not expose the dead unmatch action in the page source', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/admin/payments/[paymentId]/page.tsx'),
      'utf8',
    );

    expect(pageSource).not.toContain('/unmatch');
    expect(pageSource).not.toContain('handleUnmatch');
  });
});
