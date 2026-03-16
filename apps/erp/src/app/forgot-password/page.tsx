'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: value }),
      }).then((r) => r.json());

      if (res.success) {
        setMessage(res.message || 'Reset request created');
      } else {
        setError(res.error?.message || res.error || 'Unable to prepare reset');
      }
    } catch {
      setError('Unable to prepare reset');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">AE</div>
          <div>
            <div className="auth-brand-title">Apartment ERP</div>
            <div className="auth-brand-subtitle">Password Reset</div>
          </div>
        </div>

        <div className="auth-header">
          <h1>Forgot password</h1>
          <p>Enter your username or email. The request will be recorded and an administrator can issue your reset link.</p>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label className="auth-label">
            <span>Username or Email</span>
            <input
              className="auth-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter your username or email"
            />
          </label>

          {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
          {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

          <button type="submit" disabled={submitting} className="auth-button auth-button-primary">
            {submitting ? 'Submitting...' : 'Submit Reset Request'}
          </button>
        </form>

        <div className="auth-links auth-links-single">
          <Link href="/login">Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}
