'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type BootstrapStatus = {
  hasUsers: boolean;
  firstUserSetup: boolean;
  publicSignUpEnabled: boolean;
  requiresOwnerApproval: boolean;
};

export default function SignUpPage() {
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [form, setForm] = useState({
    displayName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/auth/bootstrap-status')
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setStatus(res.data);
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then((r) => r.json());

      if (res.success) {
        setMessage(res.message || 'Request submitted successfully');
        if (status?.firstUserSetup) {
          window.location.href = '/admin/dashboard';
          return;
        }
        return;
      }

      setError(res.error?.message || res.error || 'Unable to create account');
    } catch {
      setError('Unable to create account');
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
            <div className="auth-brand-subtitle">Account Setup</div>
          </div>
        </div>

        <div className="auth-header">
          <h1>Create account</h1>
          <p>
            {status?.firstUserSetup
              ? 'Set up the first owner account for this system.'
              : 'Staff can submit a registration request here. The owner must approve the request before sign-in is allowed.'}
          </p>
        </div>

        <>
            <form onSubmit={submit} className="auth-form">
              <label className="auth-label">
                <span>Display Name</span>
                <input
                  className="auth-input"
                  value={form.displayName}
                  onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Enter display name"
                />
              </label>

              <label className="auth-label">
                <span>Username</span>
                <input
                  className="auth-input"
                  value={form.username}
                  onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="Choose a username"
                  autoComplete="username"
                />
              </label>

              <label className="auth-label">
                <span>Email</span>
                <input
                  className="auth-input"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter email"
                  autoComplete="email"
                />
              </label>

              <label className="auth-label">
                <span>Password</span>
                <input
                  className="auth-input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Create a password"
                  autoComplete="new-password"
                />
              </label>

              <label className="auth-label">
                <span>Confirm Password</span>
                <input
                  className="auth-input"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                />
              </label>

              {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
              {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

              {!status?.firstUserSetup ? (
                <div className="auth-alert auth-alert-info">
                  Your request will stay pending until the owner approves it from the admin console.
                </div>
              ) : null}

              <button type="submit" disabled={submitting} className="auth-button auth-button-primary">
                {submitting
                  ? status?.firstUserSetup ? 'Creating...' : 'Submitting...'
                  : status?.firstUserSetup ? 'Create Owner Account' : 'Submit Staff Request'}
              </button>
            </form>

            <div className="auth-links auth-links-single">
              <Link href="/login">Back to sign in</Link>
            </div>
          </>
      </section>
    </main>
  );
}
