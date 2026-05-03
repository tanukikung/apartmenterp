'use client';

/**
 * PageShell — standardized page layout for every admin page.
 *
 * Gives every page a consistent:
 *   • Breadcrumb trail (optional)
 *   • Serif title + muted subtitle
 *   • Primary action slot (top-right)
 *   • Tabs/filters slot (below header)
 *   • Content area
 *
 * Usage:
 *   <PageShell
 *     breadcrumbs={[{ label: 'ตั้งค่า', href: '/admin/settings' }, { label: 'ผู้ใช้' }]}
 *     title="ผู้ใช้ระบบ"
 *     description="จัดการบัญชีผู้ใช้และสิทธิ์การเข้าถึง"
 *     actions={<Button>เพิ่มผู้ใช้</Button>}
 *   >
 *     ...content...
 *   </PageShell>
 */

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { FadeIn } from '@/components/motion/motion-primitives';

export type Crumb = { label: string; href?: string };

export interface PageShellProps {
  breadcrumbs?: Crumb[];
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  children: React.ReactNode;
  /** Reduce top padding when header is minimal. */
  dense?: boolean;
}

export function PageShell({
  breadcrumbs,
  title,
  description,
  actions,
  tabs,
  children,
  dense,
}: PageShellProps) {
  return (
    <div className="flex flex-col gap-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-[12.5px] text-color-text-3">
          {breadcrumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={12} className="opacity-50" />}
              {c.href ? (
                <Link href={c.href} className="hover:text-color-text-2 transition-colors">
                  {c.label}
                </Link>
              ) : (
                <span className="text-color-text-2">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <FadeIn y={4} className={`flex flex-col gap-5 ${dense ? '' : 'pb-1'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-[28px] sm:text-[32px] leading-[1.15] text-color-text">
              {title}
            </h1>
            {description && (
              <p className="mt-1.5 text-[14px] text-color-text-2 max-w-2xl">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        {tabs && (
          <div className="border-b border-color-border -mx-1 px-1">
            {tabs}
          </div>
        )}
      </FadeIn>

      <div>{children}</div>
    </div>
  );
}

/**
 * Section — grouped content block with a serif heading.
 * Use inside PageShell children to organize dense pages.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4">
          <div>
            {title && <h2 className="font-serif text-[19px] text-color-text">{title}</h2>}
            {description && <p className="text-[13px] text-color-text-3 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div>{children}</div>
    </section>
  );
}
