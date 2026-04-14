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
  const showcaseHighlights = [
    {
      title: 'จัดการอาคารในมุมมองเดียว',
      copy: 'ดูห้องพัก ผู้เช่า บิล การชำระเงิน และเอกสารได้จากหลังบ้านเดียวกันโดยไม่ต้องสลับระบบ',
    },
    {
      title: 'งานประจำวันชัดและเร็วขึ้น',
      copy: 'ตรวจสลิป วางบิล ติดตามค้างชำระ และส่งประกาศได้ใน flow ที่ต่อเนื่องและอ่านง่าย',
    },
    {
      title: 'พร้อมส่งต่อให้ทีมใช้งานจริง',
      copy: 'รองรับเจ้าของและพนักงานที่ได้รับอนุมัติ พร้อมเอกสารและสิทธิ์การใช้งานสำหรับการทำงานร่วมกัน',
    },
  ];
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
      <div className="soft-orb soft-orb-pink anim-float-soft left-[8%] top-[8%] h-44 w-44" />
      <div className="soft-orb soft-orb-blue anim-float-soft bottom-[10%] right-[8%] h-40 w-40" />

      <div className="auth-grid">
        <section className="auth-showcase">
          <div className="auth-showcase-copy">
            <span className="section-kicker">Apartment ERP</span>
            <div>
              <h1 className="auth-showcase-title">ระบบหลังบ้านที่ช่วยให้อพาร์ตเมนต์ดูเป็นมืออาชีพตั้งแต่วันแรก</h1>
              <p className="auth-showcase-subtitle">
                ออกแบบให้เจ้าของและทีมงานเห็นภาพรวมงานสำคัญเร็วขึ้น ทั้งการเข้าพัก การเงิน เอกสาร และการสื่อสารกับผู้เช่าในหน้าจอเดียว
              </p>
            </div>

            <div className="auth-stat-grid">
              <div className="auth-stat">
                <div className="auth-stat-value">Rooms</div>
                <div className="auth-stat-label">ติดตามห้องพัก สถานะการเข้าพัก และการจัดการห้องได้ต่อเนื่อง</div>
              </div>
              <div className="auth-stat">
                <div className="auth-stat-value">Billing</div>
                <div className="auth-stat-label">จัดรอบบิล ใบแจ้งหนี้ และยอดค้างชำระให้ดูง่ายขึ้นในทุกวันทำการ</div>
              </div>
              <div className="auth-stat">
                <div className="auth-stat-value">Docs</div>
                <div className="auth-stat-label">สร้างเอกสารและเตรียมการส่งมอบระบบให้ลูกค้าได้เป็นขั้นตอน</div>
              </div>
            </div>

            <div className="auth-feature-list">
              {showcaseHighlights.map((item, index) => (
                <div key={item.title} className="auth-feature">
                  <span className="auth-feature-mark">{index + 1}</span>
                  <div>
                    <div className="auth-feature-title">{item.title}</div>
                    <div className="auth-feature-copy">{item.copy}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

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
      </div>
    </main>
  );
}
