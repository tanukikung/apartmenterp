import { UnavailableFeaturePage } from '@/components/admin/UnavailableFeaturePage';

export default function DocumentActivityPage() {
  return (
    <UnavailableFeaturePage
      title="Document Activity"
      subtitle="Truthful reporting for generated-document activity is deferred."
      backHref="/admin/reports"
      backLabel="Reports"
      message="This report is intentionally unavailable."
      detail="The previous page derived document metrics from invoice data and placeholder values, which was misleading. It has been replaced with an honest deferred state until real document activity metrics exist."
      relatedLinks={[
        { href: '/admin/documents', label: 'Documents' },
        { href: '/admin/invoices', label: 'Invoices' },
      ]}
    />
  );
}
