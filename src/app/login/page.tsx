import { prisma } from '@/lib/db/client';
import LoginForm from './LoginForm';

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
      {/* Layered aurora background */}
      <div className="aurora-bg" />
      <div className="soft-orb soft-orb-pink left-[10%] top-[12%] h-44 w-44" />
      <div className="soft-orb soft-orb-blue bottom-[14%] right-[12%] h-40 w-40" />

      {/* Subtle grid pattern */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(to right, hsl(var(--color-text)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--color-text)) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />

      <LoginForm
        firstUserSetup={firstUserSetup}
        requiresOwnerApproval={requiresOwnerApproval}
        error={error}
      />
    </main>
  );
}
