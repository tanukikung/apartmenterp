import { UnavailableFeaturePage } from '@/components/admin/UnavailableFeaturePage';

export default function SettingsRoomsPage() {
  return (
    <UnavailableFeaturePage
      title="Room Settings"
      subtitle="This deployment does not have a connected room-defaults settings API."
      backHref="/admin/settings"
      backLabel="Settings"
      message="Room settings are intentionally disabled."
      detail="Default room capacity, checkout approval, and maintenance lock values are not persisted by the current backend. The misleading save form has been removed."
      relatedLinks={[
        { href: '/admin/rooms', label: 'Rooms' },
        { href: '/admin/settings', label: 'Connected Settings' },
      ]}
    />
  );
}
