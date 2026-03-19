import { UnavailableFeaturePage } from '@/components/admin/UnavailableFeaturePage';

export default function IntegrationsPage() {
  return (
    <UnavailableFeaturePage
      title="LINE Integration"
      subtitle="This deployment reads LINE credentials from environment configuration."
      backHref="/admin/settings"
      backLabel="Settings"
      message="Integration editing is intentionally disabled."
      detail="The previous page pointed at missing /api/settings/integrations and /api/line/test-message endpoints. Operators now get a clear unavailable state instead of fake save and test controls."
      relatedLinks={[
        { href: '/admin/chat', label: 'Chat' },
        { href: '/admin/system', label: 'System' },
      ]}
    />
  );
}
