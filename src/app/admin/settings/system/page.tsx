'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SystemSettingsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/settings/automation');
  }, [router]);

  return null;
}
