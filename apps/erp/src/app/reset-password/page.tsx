import ResetPasswordForm from './ResetPasswordForm';

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: { token?: string };
}) {
  return (
    <main className="auth-shell">
      <div className="soft-orb soft-orb-pink left-[10%] top-[12%] h-44 w-44" />
      <div className="soft-orb soft-orb-blue bottom-[14%] right-[12%] h-40 w-40" />
      <ResetPasswordForm token={searchParams?.token ?? ''} />
    </main>
  );
}
