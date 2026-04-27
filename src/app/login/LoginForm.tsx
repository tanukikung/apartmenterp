'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';

type Props = {
  firstUserSetup: boolean;
  requiresOwnerApproval: boolean;
  error: string | null;
};

export default function LoginForm({ firstUserSetup, requiresOwnerApproval, error }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <motion.section
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative z-10 w-full max-w-md"
    >
      {/* Glass-morphism card wrapper */}
      <div className="glass-card noise-overlay rounded-3xl p-8 md:p-10 shadow-2xl ring-1 ring-black/5">
        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="flex items-center gap-3"
        >
          <motion.div
            whileHover={{ rotate: -8, scale: 1.08 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-700 text-white shadow-lg shadow-primary/40 ring-1 ring-white/20"
          >
            <Building2 size={22} strokeWidth={2.2} />
            <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/25 to-transparent pointer-events-none" />
          </motion.div>
          <div>
            <div className="text-base font-bold tracking-tight leading-none gradient-text">Apartment ERP</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/80">
              Admin Access · v2
            </div>
          </div>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4 }}
          className="mt-8"
        >
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-on-surface">
            ยินดีต้อนรับกลับ 👋
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            เข้าสู่ระบบด้วยบัญชีเจ้าของ หรือบัญชีพนักงานที่ได้รับอนุมัติ
          </p>
        </motion.div>

        {/* Form */}
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26, duration: 0.4 }}
          action="/api/auth/login"
          method="post"
          onSubmit={() => setSubmitting(true)}
          className="mt-6 grid gap-4"
        >
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-on-surface-variant">ชื่อผู้ใช้ / อีเมล</span>
            <input
              className="auth-input focus-ring-modern"
              name="username"
              placeholder="เช่น owner หรือ you@example.com"
              autoComplete="username"
              required
              minLength={1}
              autoFocus
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-on-surface-variant">รหัสผ่าน</span>
            <div className="relative">
              <input
                className="auth-input focus-ring-modern w-full pr-11"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="ใส่รหัสผ่านของคุณ"
                autoComplete="current-password"
                required
                minLength={1}
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </motion.button>
            </div>
          </label>

          {error && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
              transition={{ duration: 0.4 }}
              className="auth-alert auth-alert-error"
              role="alert"
            >
              {error}
            </motion.div>
          )}

          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={submitting}
            className="auth-button auth-button-primary mt-2 inline-flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                กำลังเข้าสู่ระบบ...
              </>
            ) : (
              <>
                <LogIn size={16} />
                เข้าสู่ระบบ
              </>
            )}
          </motion.button>
        </motion.form>

        {/* Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.38, duration: 0.4 }}
          className="auth-links mt-5"
        >
          <Link href="/forgot-password" className="group inline-flex items-center gap-1 transition-transform">
            <span>ลืมรหัสผ่าน?</span>
            <span className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">→</span>
          </Link>
          {firstUserSetup ? (
            <Link href="/sign-up">สร้างบัญชีเจ้าของคนแรก</Link>
          ) : requiresOwnerApproval ? (
            <Link href="/sign-up">สมัครเป็นพนักงาน</Link>
          ) : (
            <span className="text-on-surface-variant">บัญชีสร้างโดยเจ้าของ</span>
          )}
        </motion.div>
      </div>

      {/* Bottom hint */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-5 text-center text-[11px] text-on-surface-variant/70"
      >
        เพื่อความปลอดภัยสูงสุด กรุณาออกจากระบบทุกครั้งหลังใช้งานเสร็จ
      </motion.p>
    </motion.section>
  );
}
