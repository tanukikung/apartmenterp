import Link from 'next/link';
import { prisma } from '@/lib/db/client';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const firstUserSetup = (await prisma.adminUser.count()) === 0;
  const requiresOwnerApproval = !firstUserSetup;
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;

  return (
    <main className="auth-shell">
      <div className="soft-orb soft-orb-pink left-[10%] top-[12%] h-44 w-44" />
      <div className="soft-orb soft-orb-blue bottom-[14%] right-[12%] h-40 w-40" />
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">AE</div>
          <div>
            <div className="auth-brand-title">Apartment ERP</div>
            <div className="auth-brand-subtitle">Owner and Staff Access</div>
          </div>
        </div>

        <div className="auth-header">
          <h1>Sign in</h1>
          <p>Access the operations console with your owner or approved staff account.</p>
        </div>

        <form action="/api/auth/login" method="post" className="auth-form">
          <label className="auth-label">
            <span>Username or Email</span>
            <input
              className="auth-input"
              name="username"
              placeholder="Enter your username"
              autoComplete="username"
              required
              minLength={1}
            />
          </label>

          <label className="auth-label">
            <span>Password</span>
            <input
              className="auth-input"
              name="password"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              minLength={1}
            />
          </label>

          {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

          <button type="submit" className="auth-button auth-button-primary">
            Sign In
          </button>
        </form>

        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
          {firstUserSetup ? <Link href="/sign-up">Create first owner</Link> : requiresOwnerApproval ? <Link href="/sign-up">Register as staff</Link> : <span>Accounts are created by owners</span>}
        </div>
      </section>
    </main>
  );
}
