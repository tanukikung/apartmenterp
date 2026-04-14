import Link from 'next/link';
import { prisma } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const firstUserSetup = (await prisma.adminUser.count()) === 0;
  const requiresOwnerApproval = !firstUserSetup;
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const helperItems = firstUserSetup
    ? [
        'เริ่มต้นระบบด้วยการสร้างบัญชีเจ้าของคนแรก',
        'หลังจากนั้นเจ้าของสามารถอนุมัติพนักงานและจัดการสิทธิ์ได้',
      ]
    : [
        'รองรับเฉพาะบัญชีเจ้าของและพนักงานที่ได้รับอนุมัติแล้ว',
        'หากลืมรหัสผ่าน สามารถเริ่มกระบวนการรีเซ็ตได้จากลิงก์ด้านล่าง',
      ];

  return (
    <main className="auth-shell">
      <div className="soft-orb soft-orb-pink left-[10%] top-[12%] h-44 w-44" />
      <div className="soft-orb soft-orb-blue bottom-[14%] right-[12%] h-40 w-40" />
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <span className="text-sm font-bold tracking-tight leading-none">AE</span>
          </div>
          <div>
            <div className="auth-brand-title">Apartment ERP</div>
            <div className="auth-brand-subtitle">ศูนย์ควบคุมหลังบ้าน</div>
          </div>
        </div>

        <div className="auth-header">
          <h1>เข้าสู่ระบบผู้ดูแล</h1>
          <p>
            {firstUserSetup
              ? 'เริ่มตั้งค่าระบบครั้งแรกสำหรับเจ้าของอาคาร'
              : 'ใช้บัญชีเจ้าของหรือพนักงานที่ได้รับอนุมัติเพื่อเข้าสู่ระบบหลังบ้าน'}
          </p>
        </div>

        <form action="/api/auth/login" method="post" className="auth-form">
          <label className="auth-label">
            <span>ชื่อผู้ใช้หรืออีเมล</span>
            <input
              className="auth-input"
              name="username"
              placeholder="กรอกชื่อผู้ใช้"
              autoComplete="username"
              required
              minLength={1}
            />
          </label>

          <label className="auth-label">
            <span>รหัสผ่าน</span>
            <input
              className="auth-input"
              name="password"
              type="password"
              placeholder="กรอกรหัสผ่าน"
              autoComplete="current-password"
              required
              minLength={1}
            />
          </label>

          {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

          <button type="submit" className="auth-button auth-button-primary">
            เข้าสู่ระบบ
          </button>
        </form>

        <div className="auth-helper">
          <div className="auth-helper-title">ก่อนเริ่มใช้งาน</div>
          <ul className="auth-helper-list">
            {helperItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="auth-links">
          <Link href="/forgot-password">ลืมรหัสผ่าน?</Link>
          {firstUserSetup ? (
            <Link href="/sign-up">สร้างเจ้าของคนแรก</Link>
          ) : requiresOwnerApproval ? (
            <Link href="/sign-up">ลงทะเบียนพนักงาน</Link>
          ) : (
            <span>บัญชีใหม่ต้องได้รับอนุมัติจากเจ้าของ</span>
          )}
        </div>
      </section>
    </main>
  );
}
