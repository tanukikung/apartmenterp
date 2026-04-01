'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail }),
      });

      const data: { success?: boolean; error?: { message?: string } | string } = await res.json();

      if (!data.success) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : (data.error as { message?: string })?.message ?? 'Failed to submit reset request';
        throw new Error(msg);
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="soft-orb soft-orb-pink left-[10%] top-[12%] h-44 w-44" />
      <div className="soft-orb soft-orb-blue bottom-[14%] right-[12%] h-40 w-40" />

      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">AE</div>
          <div>
            <div className="auth-brand-title">Apartment ERP</div>
            <div className="auth-brand-subtitle">Password Recovery</div>
          </div>
        </div>

        {success ? (
          <>
            <div className="auth-header">
              <h1>Request Submitted</h1>
            </div>

            <div className="auth-alert auth-alert-success">
              Reset request submitted. Contact your system administrator — they will share the reset
              link with you directly.
            </div>

            <div className="auth-links">
              <Link href="/login">← Back to Sign In</Link>
            </div>
          </>
        ) : (
          <>
            <div className="auth-header">
              <h1>Forgot Password?</h1>
              <p>Enter your username or email — an admin will generate a reset link.</p>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
              <label className="auth-label">
                <span>Username or Email</span>
                <input
                  className="auth-input"
                  type="text"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="Enter your username or email"
                  autoComplete="username"
                  required
                  minLength={1}
                />
              </label>

              {error && <div className="auth-alert auth-alert-error">{error}</div>}

              <button
                type="submit"
                className="auth-button auth-button-primary"
                disabled={loading}
              >
                {loading ? 'Submitting…' : 'Send Reset Request'}
              </button>
            </form>

            <div className="auth-links">
              <Link href="/login">← Back to Sign In</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
