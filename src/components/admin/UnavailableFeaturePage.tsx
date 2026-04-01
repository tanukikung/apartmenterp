import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Info } from 'lucide-react';

type RelatedLink = {
  href: string;
  label: string;
};

type Props = {
  title: string;
  subtitle: string;
  backHref: string;
  backLabel: string;
  message: string;
  detail?: string;
  relatedLinks?: RelatedLink[];
};

export function UnavailableFeaturePage({
  title,
  subtitle,
  backHref,
  backLabel,
  message,
  detail,
  relatedLinks = [],
}: Props) {
  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="admin-page-title">{title}</h1>
            <p className="admin-page-subtitle">{subtitle}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-6 text-amber-900 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-2">
            <p className="font-semibold">{message}</p>
            {detail ? <p className="text-sm text-amber-800">{detail}</p> : null}
          </div>
        </div>
      </section>

      {relatedLinks.length > 0 ? (
        <section className="rounded-3xl border border-sky-100 bg-sky-50/70 px-6 py-5 text-sm text-sky-900 shadow-sm">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
            <div className="flex flex-wrap gap-3">
              {relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-semibold text-sky-700 underline underline-offset-2"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="text-sm text-slate-500">
        <Link href={backHref} className="font-medium text-indigo-600 hover:underline">
          กลับไปยัง {backLabel}
        </Link>
      </div>
    </main>
  );
}
