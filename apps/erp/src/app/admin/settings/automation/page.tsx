import { UnavailableFeaturePage } from '@/components/admin/UnavailableFeaturePage';

export default function AutomationRulesPage() {
  return (
    <UnavailableFeaturePage
      title="Automation Rules"
      subtitle="Automation rule editing is not connected in this deployment."
      backHref="/admin/settings"
      backLabel="Settings"
      message="Automation settings are intentionally hidden from active use."
      detail="The previous page depended on /api/settings/automation, which does not exist here. Operators now see a clear unavailable state instead of a non-persistent save form."
      relatedLinks={[
        { href: '/admin/system-jobs', label: 'System Jobs' },
        { href: '/admin/settings/billing-policy', label: 'Billing Calendar' },
      ]}
    />
  );
}
