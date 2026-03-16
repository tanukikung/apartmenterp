'use client';

import { useState } from 'react';

export default function LogoutButton() {
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    setSubmitting(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <button type="button" className="admin-button" onClick={logout} disabled={submitting}>
      {submitting ? 'Signing out...' : 'Sign Out'}
    </button>
  );
}
