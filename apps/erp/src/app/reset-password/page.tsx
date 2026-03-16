import ResetPasswordForm from './ResetPasswordForm';

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: { token?: string };
}) {
  return (
    <main className="auth-shell">
      <ResetPasswordForm token={searchParams?.token || ''} />
    </main>
  );
}
