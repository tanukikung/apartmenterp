'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ResetPasswordForm({ token }: { token: string }) {
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
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      }).then((r) => r.json());

      if (res.success) {
        setMessage(res.message || 'Password reset successfully');
      } else {
        setError(res.error?.message || res.error || 'Unable to reset password');
      }
    } catch {
      setError('Unable to reset password');
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
          <div className="auth-brand-subtitle">Set New Password</div>
        </div>
      </div>

      <div className="auth-header">
        <h1>Reset password</h1>
        <p>Create a new password for your account.</p>
      </div>

      <form onSubmit={submit} className="auth-form">
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

        <button type="submit" disabled={submitting || !token} className="auth-button auth-button-primary">
          {submitting ? 'Saving...' : 'Reset Password'}
        </button>
      </form>

      <div className="auth-links auth-links-single">
        <Link href="/login">Back to sign in</Link>
      </div>
    </section>
  );
}
