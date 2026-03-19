import { UnavailableFeaturePage } from '@/components/admin/UnavailableFeaturePage';

export default function BankAccountsPage() {
  return (
    <UnavailableFeaturePage
      title="Bank Accounts"
      subtitle="Bank account management is not connected in this deployment."
      backHref="/admin/settings"
      backLabel="Settings"
      message="Bank account editing is intentionally disabled."
      detail="The prior page showed demo data and edit controls without a real /api/settings/bank-accounts backend. That demo UI has been removed to avoid false operator confidence."
      relatedLinks={[
        { href: '/admin/billing', label: 'Billing Cycles' },
        { href: '/admin/invoices', label: 'Invoices' },
      ]}
    />
  );
}
