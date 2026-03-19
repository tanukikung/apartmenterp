import { UnavailableFeaturePage } from '@/components/admin/UnavailableFeaturePage';

export default function BuildingInfoPage() {
  return (
    <UnavailableFeaturePage
      title="Building Info"
      subtitle="This deployment does not have a connected building-profile settings API."
      backHref="/admin/settings"
      backLabel="Settings"
      message="Building profile editing is intentionally disabled."
      detail="The current backend only stores billing calendar values. Showing a save form here would be misleading because building name, address, and contact fields cannot persist."
      relatedLinks={[
        { href: '/admin/settings/billing-policy', label: 'Billing Calendar' },
        { href: '/admin/settings/users', label: 'Admin Users' },
      ]}
    />
  );
}
