import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readAppFile(...segments: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');
}

describe('UI truthfulness static guards', () => {
  it('settings hub only links to connected settings pages', () => {
    const source = readAppFile('src', 'app', 'admin', 'settings', 'page.tsx');

    expect(source).toContain('/admin/settings/users');
    expect(source).toContain('/admin/settings/billing-policy');
    expect(source).toContain('/admin/settings/roles');

    expect(source).not.toContain('/admin/settings/building');
    expect(source).not.toContain('/admin/settings/automation');
    expect(source).not.toContain('/admin/settings/bank-accounts');
    expect(source).not.toContain('/admin/settings/integrations');
    expect(source).not.toContain('/admin/settings/rooms');
  });

  it('admin users page includes the backend-required display name field', () => {
    const source = readAppFile('src', 'app', 'admin', 'settings', 'users', 'page.tsx');

    expect(source).toContain('Display Name');
    expect(source).toContain("displayName: form.displayName.trim()");
  });

  it('billing list action is labeled truthfully', () => {
    const source = readAppFile('src', 'app', 'admin', 'billing', 'page.tsx');

    expect(source).toContain('Open Cycle');
    expect(source).not.toContain('Generate Invoices');
  });

  it('chat quick actions no longer append fake success messages into the timeline', () => {
    const source = readAppFile('src', 'app', 'admin', 'chat', 'page.tsx');

    expect(source).not.toContain("await sendText('Invoice sending queued.')");
    expect(source).not.toContain("await sendText('Reminder queued.')");
    expect(source).not.toContain("await sendText('Receipt sending queued.')");
    expect(source).not.toContain("await sendText('Payment confirmed.')");
    expect(source).toContain('setSuccessNotice(');
  });

  it('reports hub no longer advertises the deferred documents report', () => {
    const source = readAppFile('src', 'app', 'admin', 'reports', 'page.tsx');

    expect(source).not.toContain('/admin/reports/documents');
  });

  it('billing detail page no longer probes dead legacy record routes', () => {
    const source = readAppFile('src', 'app', 'admin', 'billing', '[billingId]', 'page.tsx');

    expect(source).not.toContain('/api/billing-records');
    expect(source).not.toContain('/api/billing/${cycleId}/records');
    expect(source).not.toContain('/api/invoices/${billingId}');
  });
});
