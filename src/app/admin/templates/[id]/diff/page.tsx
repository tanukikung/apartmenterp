'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

type TemplateVersion = {
  id: string;
  version: number;
  label: string | null;
  status: string;
  fileType: string;
  createdAt: string;
};

type TemplateDetail = {
  id: string;
  name: string;
  activeVersionId: string | null;
  versions?: TemplateVersion[];
};

type VersionContent = {
  body: string;
  subject: string | null;
};

type DiffLine =
  | { kind: 'equal'; left: string; right: string; leftNo: number; rightNo: number }
  | { kind: 'delete'; left: string; leftNo: number }
  | { kind: 'insert'; right: string; rightNo: number };

// Line-level LCS diff. Both bodies are split on newlines, then aligned using
// the longest-common-subsequence table. Templates are usually short enough
// (< a few hundred lines) that this O(n*m) approach is fine.
function computeLineDiff(a: string, b: string): DiffLine[] {
  const aLines = a.replace(/\r\n/g, '\n').split('\n');
  const bLines = b.replace(/\r\n/g, '\n').split('\n');
  const n = aLines.length;
  const m = bLines.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) {
        lcs[i][j] = lcs[i + 1][j + 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      out.push({
        kind: 'equal',
        left: aLines[i],
        right: bLines[j],
        leftNo: i + 1,
        rightNo: j + 1,
      });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'delete', left: aLines[i], leftNo: i + 1 });
      i++;
    } else {
      out.push({ kind: 'insert', right: bLines[j], rightNo: j + 1 });
      j++;
    }
  }
  while (i < n) {
    out.push({ kind: 'delete', left: aLines[i], leftNo: i + 1 });
    i++;
  }
  while (j < m) {
    out.push({ kind: 'insert', right: bLines[j], rightNo: j + 1 });
    j++;
  }
  return out;
}

function diffStats(lines: DiffLine[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.kind === 'insert') additions++;
    else if (line.kind === 'delete') deletions++;
  }
  return { additions, deletions };
}

export default function TemplateDiffPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [leftVersionId, setLeftVersionId] = useState<string>(search.get('a') ?? '');
  const [rightVersionId, setRightVersionId] = useState<string>(search.get('b') ?? '');
  const [leftContent, setLeftContent] = useState<VersionContent | null>(null);
  const [rightContent, setRightContent] = useState<VersionContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load template detail to populate version selectors.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/templates/${params.id}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message ?? 'ไม่สามารถโหลดเทมเพลต');
        }
        if (cancelled) return;
        const detail = json.data as TemplateDetail;
        setTemplate(detail);
        // Default: compare active version against the previous one.
        const versions = detail.versions ?? [];
        const sorted = [...versions].sort((a, b) => b.version - a.version);
        if (!leftVersionId && sorted[1]) setLeftVersionId(sorted[1].id);
        if (!rightVersionId && sorted[0]) setRightVersionId(sorted[0].id);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'โหลดเทมเพลตไม่สำเร็จ');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, leftVersionId, rightVersionId]);

  // Fetch content for the two selected versions.
  useEffect(() => {
    if (!leftVersionId || !rightVersionId) return;
    let cancelled = false;
    (async () => {
      try {
        const [leftRes, rightRes] = await Promise.all([
          fetch(`/api/templates/${params.id}/versions/${leftVersionId}/content`, { cache: 'no-store' }),
          fetch(`/api/templates/${params.id}/versions/${rightVersionId}/content`, { cache: 'no-store' }),
        ]);
        const [leftJson, rightJson] = await Promise.all([leftRes.json(), rightRes.json()]);
        if (!leftRes.ok || !leftJson.success) {
          throw new Error(leftJson.error?.message ?? 'โหลดเวอร์ชัน A ไม่สำเร็จ');
        }
        if (!rightRes.ok || !rightJson.success) {
          throw new Error(rightJson.error?.message ?? 'โหลดเวอร์ชัน B ไม่สำเร็จ');
        }
        if (cancelled) return;
        setLeftContent(leftJson.data as VersionContent);
        setRightContent(rightJson.data as VersionContent);
        setError(null);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'โหลดเนื้อหาไม่สำเร็จ');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, leftVersionId, rightVersionId]);

  const diff = useMemo(() => {
    if (!leftContent || !rightContent) return null;
    return computeLineDiff(leftContent.body, rightContent.body);
  }, [leftContent, rightContent]);

  const stats = useMemo(() => (diff ? diffStats(diff) : null), [diff]);
  const sortedVersions = useMemo(() => {
    return [...(template?.versions ?? [])].sort((a, b) => b.version - a.version);
  }, [template]);

  return (
    <main className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href={`/admin/templates/${params.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30"
            >
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </Link>
            <div>
              <h1 className="text-base font-semibold text-on-primary">เปรียบเทียบเวอร์ชัน</h1>
              <p className="text-xs text-on-primary/80 mt-0.5">
                {template?.name ?? 'กำลังโหลด...'}
              </p>
            </div>
          </div>
          {stats ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 font-semibold text-emerald-100 border border-emerald-400/30">
                +{stats.additions}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1 font-semibold text-red-100 border border-red-400/30">
                −{stats.deletions}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-outline-variant">
              เวอร์ชัน A (เก่า)
            </label>
            <select
              value={leftVersionId}
              onChange={(e) => setLeftVersionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
            >
              {sortedVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} — {v.status} ({new Date(v.createdAt).toLocaleDateString('th-TH')})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-outline-variant">
              เวอร์ชัน B (ใหม่)
            </label>
            <select
              value={rightVersionId}
              onChange={(e) => setRightVersionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
            >
              {sortedVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} — {v.status} ({new Date(v.createdAt).toLocaleDateString('th-TH')})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-outline-variant text-sm font-semibold text-on-surface">
          Side-by-side
        </div>
        {loading && !diff ? (
          <div className="py-16 text-center text-on-surface-variant">กำลังโหลด...</div>
        ) : !diff ? (
          <div className="py-16 text-center text-on-surface-variant">
            เลือกสองเวอร์ชันเพื่อเปรียบเทียบ
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="w-10 px-2 py-2 text-right text-outline-variant">A</th>
                  <th className="px-3 py-2 text-left text-on-surface">เวอร์ชัน A</th>
                  <th className="w-10 px-2 py-2 text-right text-outline-variant">B</th>
                  <th className="px-3 py-2 text-left text-on-surface">เวอร์ชัน B</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((line, idx) => {
                  if (line.kind === 'equal') {
                    return (
                      <tr key={idx} className="border-b border-outline-variant/30">
                        <td className="px-2 py-1 text-right text-outline-variant">{line.leftNo}</td>
                        <td className="px-3 py-1 text-on-surface-variant whitespace-pre-wrap break-all">
                          {line.left || ' '}
                        </td>
                        <td className="px-2 py-1 text-right text-outline-variant">{line.rightNo}</td>
                        <td className="px-3 py-1 text-on-surface-variant whitespace-pre-wrap break-all">
                          {line.right || ' '}
                        </td>
                      </tr>
                    );
                  }
                  if (line.kind === 'delete') {
                    return (
                      <tr key={idx} className="border-b border-outline-variant/30 bg-red-50">
                        <td className="px-2 py-1 text-right text-red-600">{line.leftNo}</td>
                        <td className="px-3 py-1 text-red-900 whitespace-pre-wrap break-all">
                          − {line.left || ' '}
                        </td>
                        <td className="px-2 py-1 text-right text-outline-variant"></td>
                        <td className="px-3 py-1"></td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={idx} className="border-b border-outline-variant/30 bg-emerald-50">
                      <td className="px-2 py-1 text-right text-outline-variant"></td>
                      <td className="px-3 py-1"></td>
                      <td className="px-2 py-1 text-right text-emerald-700">{line.rightNo}</td>
                      <td className="px-3 py-1 text-emerald-900 whitespace-pre-wrap break-all">
                        + {line.right || ' '}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
