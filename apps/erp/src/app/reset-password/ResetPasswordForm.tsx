'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const REDIRECT_DELAY = 3; // seconds

export default function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(REDIRECT_DELAY);
  const [error, setError] = useState<string | null>(null);
  const [clientReady, setClientReady] = useState(false);

  // resolve token from URL if not passed as prop (fallback)
  const resolvedToken = useRef(token);
  useEffect(() => {
    if (!resolvedToken.current && typeof window !== 'undefined') {
      resolvedToken.current = new URLSearchParams(window.location.search).get('token') ?? '';
    }
    setClientReady(true);
  }, []);

  // countdown + redirect after success
  useEffect(() => {
    if (!success) return;
    if (countdown <= 0) {
      window.location.href = '/login';
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [success, countdown]);

  const tokenValue = resolvedToken.current;
  const noToken = clientReady && !tokenValue;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenValue, password, confirmPassword }),
      });

      const data: { success?: boolean; error?: { message?: string } | string } = await res.json();

      if (!data.success) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : (data.error as { message?: string })?.message ?? 'Unable to reset password';
        throw new Error(msg);
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── No token state ──────────────────────────────────────────────────────────
  if (noToken) {
    return (
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">AE</div>
          <div>
            <div className="auth-brand-title">Apartment ERP</div>
            <div className="auth-brand-subtitle">Password Recovery</div>
          </div>
        </div>
        <div className="auth-header">
          <h1>Invalid Reset Link</h1>
          <p>This link is missing a reset token or has expired.</p>
        </div>
        <div className="auth-alert auth-alert-error">
          No reset token found. Please request a new password reset link.
        </div>
        <div className="auth-links">
          <Link href="/forgot-password">← Request a new link</Link>
          <Link href="/login">Back to Sign In</Link>
        </div>
      </section>
    );
  }

  // ── Success state ───────────────────────────────────────────────────────────
  if (success) {
    return (
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">AE</div>
          <div>
            <div className="auth-brand-title">Apartment ERP</div>
            <div className="auth-brand-subtitle">Password Recovery</div>
          </div>
        </div>
        <div className="auth-header">
          <h1>Password Updated</h1>
        </div>
        <div className="auth-alert auth-alert-success">
          Your password has been reset successfully. Redirecting to sign in in{' '}
          <strong>{countdown}</strong> second{countdown !== 1 ? 's' : ''}…
        </div>
        <div className="auth-links">
          <Link href="/login">Sign In now →</Link>
        </div>
      </section>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <section className="auth-card">
      <div className="auth-brand">
        <div className="auth-brand-mark">AE</div>
        <div>
          <div className="auth-brand-title">Apartment ERP</div>
          <div className="auth-brand-subtitle">Password Recovery</div>
        </div>
      </div>

      <div className="auth-header">
        <h1>Set New Password</h1>
        <p>Choose a strong password for your account.</p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
        {/* New Password */}
        <label className="auth-label">
          <span>New Password</span>
          <div className="relative">
            <input
              className="auth-input pr-10"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <span className="mt-1 text-xs text-slate-400">At least 8 characters</span>
        </label>

        {/* Confirm Password */}
        <label className="auth-label">
          <span>Confirm Password</span>
          <div className="relative">
            <input
              className="auth-input pr-10"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}

        <button
          type="submit"
          className="auth-button auth-button-primary"
          disabled={loading}
        >
          {loading ? 'Saving…' : 'Reset Password'}
        </button>
      </form>

      <div className="auth-links">
        <Link href="/login">← Back to Sign In</Link>
      </div>
    </section>
  );
}
