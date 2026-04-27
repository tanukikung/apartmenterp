'use client';

import { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';

type Version = {
  id: string;
  version: number;
  label: string | null;
  status: string;
  activatedAt: string | null;
  createdAt: string;
  body: string;
};

type Props = {
  templateId: string;
  onClose: () => void;
};

type DiffPart = { type: 'equal' | 'add' | 'remove'; text: string };

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function diffWords(oldText: string, newText: string): DiffPart[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  // Simple LCS-based diff
  const m = oldWords.length;
  const n = newWords.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  let i = m, j = n;
  const parts: DiffPart[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      parts.unshift({ type: 'equal', text: oldWords[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.unshift({ type: 'add', text: newWords[j - 1] });
      j--;
    } else {
      parts.unshift({ type: 'remove', text: oldWords[i - 1] });
      i--;
    }
  }

  // Merge consecutive same-type parts
  const merged: DiffPart[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && last.type === part.type) {
      last.text += part.text;
    } else {
      merged.push({ ...part });
    }
  }
  return merged;
}

export function VersionHistoryModal({ templateId, onClose }: Props) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffPart[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/templates/${templateId}/versions?pageSize=50`, { cache: 'no-store' });
        const json = await res.json();
        if (json.success) {
          // Fetch body for each version
          const vers = json.data.data as Version[];
          const withBodies = await Promise.all(
            vers.map(async (v) => {
              try {
                const r = await fetch(`/api/templates/${templateId}/versions/${v.id}/content`, { cache: 'no-store' });
                const j = await r.json();
                return { ...v, body: j.data?.body ?? '' };
              } catch {
                return { ...v, body: '' };
              }
            }),
          );
          setVersions(withBodies);
          if (withBodies.length >= 2) {
            setCompareA(withBodies[1].id);
            setCompareB(withBodies[0].id);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [templateId]);

  // Compute diff when selections change
  useEffect(() => {
    if (!compareA || !compareB) { setDiff([]); return; }
    const vA = versions.find((v) => v.id === compareA);
    const vB = versions.find((v) => v.id === compareB);
    if (!vA || !vB) return;
    const textA = stripHtml(vA.body);
    const textB = stripHtml(vB.body);
    setDiff(diffWords(textA, textB));
  }, [compareA, compareB, versions]);

  const selectedA = versions.find((v) => v.id === compareA);
  const selectedB = versions.find((v) => v.id === compareB);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-16" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-on-surface">ประวัติเวอร์ชัน</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">เลือกเวอร์ชันเพื่อดูการเปลี่ยนแปลง</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Version list */}
          <div className="w-72 border-r border-outline-variant overflow-y-auto">
            <div className="p-3 space-y-1">
              {loading ? (
                <div className="py-8 text-center text-sm text-on-surface-variant">กำลังโหลด...</div>
              ) : versions.length === 0 ? (
                <div className="py-8 text-center text-sm text-on-surface-variant">ไม่มีประวัติเวอร์ชัน</div>
              ) : (
                versions.map((v) => (
                  <div key={v.id} className="flex flex-col gap-1 rounded-xl px-3 py-2.5 hover:bg-surface-container transition-colors cursor-pointer"
                    onClick={() => {
                      if (!compareA) { setCompareA(v.id); setCompareB(compareB ?? versions.find((x) => x.id !== compareA)?.id ?? null); }
                      else if (!compareB) { setCompareB(v.id); }
                      else { setCompareA(v.id); setCompareB(versions.find((x) => x.id !== compareA)?.id ?? null); }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${v.id === compareA ? 'bg-blue-500' : v.id === compareB ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="font-semibold text-sm text-on-surface">v{v.version}</span>
                      <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${v.status === 'ACTIVE' ? 'bg-success-container text-on-success-container' : v.status === 'DRAFT' ? 'bg-warning-container text-on-warning-container' : 'bg-surface-container-low text-on-surface-variant'}`}>
                        {v.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant pl-4">
                      <Clock className="h-3 w-3" />
                      {new Date(v.createdAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                    {v.label && <div className="text-xs text-on-surface-variant pl-4 truncate">{v.label}</div>}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Diff view */}
          <div className="flex-1 overflow-y-auto p-6">
            {diff.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="text-4xl mb-3">📄</div>
                <p className="text-on-surface-variant text-sm">เลือกเวอร์ชันเพื่อดูการเปลี่ยนแปลง</p>
                <p className="text-on-surface-variant text-xs mt-1">คลิกเวอร์ชันที่ต้องการเปรียบเทียบ</p>
              </div>
            ) : (
              <div>
                {/* Diff header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <div className="w-3 h-3 rounded bg-blue-500" />
                    <span className="text-blue-700">v{selectedA?.version}</span>
                  </div>
                  <span className="text-on-surface-variant text-xs">→</span>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <div className="w-3 h-3 rounded bg-emerald-500" />
                    <span className="text-on-success-container">v{selectedB?.version}</span>
                  </div>
                  <span className="ml-auto text-xs text-on-surface-variant">
                    {diff.filter((p) => p.type === 'remove').length > 0 && (
                      <span className="text-red-500">−{diff.filter((p) => p.type === 'remove').length}</span>
                    )}
                    {' '}
                    {diff.filter((p) => p.type === 'add').length > 0 && (
                      <span className="text-on-success-container">+{diff.filter((p) => p.type === 'add').length}</span>
                    )}
                  </span>
                </div>

                {/* Diff content */}
                <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">
                  {diff.map((part, idx) => {
                    if (part.type === 'equal') return <span key={idx}>{part.text}</span>;
                    if (part.type === 'remove') return <mark key={idx} className="bg-red-100 text-red-800 rounded-sm px-0.5 line-through">{part.text}</mark>;
                    if (part.type === 'add') return <mark key={idx} className="bg-emerald-100 text-emerald-800 rounded-sm px-0.5">{part.text}</mark>;
                    return null;
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
