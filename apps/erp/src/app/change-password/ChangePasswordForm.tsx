'use client';

import { useState } from 'react';

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, password, confirmPassword }),
      }).then((r) => r.json());

      if (res.success) {
        setMessage(res.message || 'Password changed successfully');
        window.location.href = '/admin/dashboard';
        return;
      }

      setError(res.error?.message || res.error || 'Unable to change password');
    } catch {
      setError('Unable to change password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-brand">
        <div className="auth-brand-mark">AE</div>
        <div>
          <div className="auth-brand-title">Apartment ERP</div>
          <div className="auth-brand-subtitle">Security Update</div>
        </div>
      </div>

      <div className="auth-header">
        <h1>Change password</h1>
        <p>Your account was created with a temporary password. Set a new password before entering the admin console.</p>
      </div>

      <form onSubmit={submit} className="auth-form">
        <label className="auth-label">
          <span>Current Password</span>
          <input
            className="auth-input"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            autoComplete="current-password"
          />
        </label>

        <label className="auth-label">
          <span>New Password</span>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
            autoComplete="new-password"
          />
        </label>

        <label className="auth-label">
          <span>Confirm Password</span>
          <input
            className="auth-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
          />
        </label>

        {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
        {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

        <button type="submit" disabled={submitting} className="auth-button auth-button-primary">
          {submitting ? 'Saving...' : 'Update Password'}
        </button>
      </form>
    </section>
  );
}
