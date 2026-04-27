'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  FilePlus2,
  History,
  Layers3,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import { TemplateWordEditor } from '@/components/document-editor/TemplateWordEditor';
import { VersionHistoryModal } from '@/components/document-editor/extensions/VersionHistoryModal';
import { CommentPanel } from '@/components/document-editor/extensions/CommentPanel';
import { createRepeatBlockMarkup, createScalarFieldMarkup } from '@/modules/documents/field-catalog';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

type TemplateField = {
  key: string;
  label: string;
  category: string;
  description: string | null;
  isCollection: boolean;
  isRequired: boolean;
};

type TemplateVersion = {
  id: string;
  version: number;
  label: string | null;
  status: string;
  fileType: string;
  activatedAt: string | null;
};

type TemplateDetail = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  subject: string | null;
  activeVersionId: string | null;
  updatedAt: string | null;
  versions?: TemplateVersion[];
  fields?: TemplateField[];
};

const TEMPLATE_TYPES = [
  'INVOICE',
  'PAYMENT_NOTICE',
  'RECEIPT',
  'CONTRACT',
  'GENERAL_NOTICE',
  'NOTICE',
  'OTHER',
] as const;

export default function TemplateEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const isNew = params.id === 'new';

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starterSelected, setStarterSelected] = useState(!isNew);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showTrash, setShowTrash] = useState(false);
  const [trashImages, setTrashImages] = useState<Array<{
    id: string;
    imageUrl: string;
    originalName: string;
    size: number;
  }>>([]);
  const [galleryImages, setGalleryImages] = useState<Array<{
    id: string;
    imageUrl: string;
    originalName: string;
    size: number;
  }>>([]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [versionContent, setVersionContent] = useState<string>('<p></p>');
  const [initialVersionContent, setInitialVersionContent] = useState<string>('<p></p>');
  const [versionSubject, setVersionSubject] = useState<string>('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'INVOICE',
    subject: '',
    body: '<p></p>',
  });

  const activeEditorRef = useRef<import('@tiptap/react').Editor | null>(null);

  async function loadTemplate(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/templates/${id}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถโหลดเทมเพลต');
      }
      const nextTemplate = json.data as TemplateDetail;
      setTemplate(nextTemplate);
      setForm({
        name: nextTemplate.name,
        description: nextTemplate.description ?? '',
        type: nextTemplate.type,
        subject: nextTemplate.subject ?? '',
        body: '<p></p>',
      });
      const draftVersion = nextTemplate.versions?.find((version) => version.status === 'DRAFT');
      setSelectedVersionId(draftVersion?.id ?? nextTemplate.activeVersionId ?? nextTemplate.versions?.[0]?.id ?? null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถโหลดเทมเพลต');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isNew) return;
    void loadTemplate(params.id);
  }, [isNew, params.id]);

  // Load version content when selected version changes
  useEffect(() => {
    if (!selectedVersionId || isNew) return;
    const tid = params.id;
    const vid = selectedVersionId;
    let cancelled = false;
    setContentLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/templates/${tid}/versions/${vid}/content`, { cache: 'no-store' });
        const json = await res.json();
        if (cancelled || !json.success) return;
        const body = json.data.body ?? '<p></p>';
        setVersionContent(body);
        setInitialVersionContent(body);
        setVersionSubject(json.data.subject ?? '');
      } catch {
        // silently fail — content will stay as-is
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNew, params.id, selectedVersionId]);

  // Load gallery images when template changes
  useEffect(() => {
    if (!params.id || isNew) return;
    void (async () => {
      try {
        const res = await fetch(`/api/templates/${params.id}/images`, { cache: 'no-store' });
        const json = await res.json();
        if (json.success) {
          setGalleryImages(json.data ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, [isNew, params.id]);

  // Debounced auto-save for version content
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleContentSave(html: string) {
    if (!selectedVersionId || isNew) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await fetch(`/api/templates/${params.id}/versions/${selectedVersionId}/content`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: html }),
        });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 1500);
  }

  // Mark dirty when the editor content differs from the loaded version content.
  useUnsavedChanges(!isNew && versionContent !== initialVersionContent);

  const groupedFields = useMemo(() => {
    const groups = new Map<string, TemplateField[]>();
    for (const field of template?.fields ?? []) {
      const key = field.category.toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), field]);
    }
    return Array.from(groups.entries());
  }, [template]);

  const filteredGroupedFields = useMemo(() => {
    if (!fieldSearch.trim()) return groupedFields;
    const q = fieldSearch.toLowerCase();
    return groupedFields
      .map(([group, fields]) => [group, fields.filter(
        (f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q),
      )] as [string, TemplateField[]])
      .filter(([, fields]) => fields.length > 0);
  }, [groupedFields, fieldSearch]);

  async function saveMetadata() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (isNew) {
        const response = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error?.message ?? 'ไม่สามารถสร้างเทมเพลต');
        }
        const created = json.data as TemplateDetail;
        setMessage('สร้างเทมเพลตแล้ว กำลังเปิดตัวแก้ไข...');
        router.replace(`/admin/templates/${created.id}/edit`);
        return;
      }

      const response = await fetch(`/api/templates/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          type: form.type,
          subject: form.subject || null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถบันทึกเทมเพลต');
      }
      setMessage('บันทึกการตั้งค่าเทมเพลตแล้ว');
      await loadTemplate(params.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถบันทึกเทมเพลต');
    } finally {
      setSaving(false);
    }
  }

  async function createDraft() {
    setWorking('draft');
    setError(null);
    try {
      const response = await fetch(`/api/templates/${params.id}/versions`, {
        method: 'POST',
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถสร้างฉบับร่าง');
      }
      await loadTemplate(params.id);
      setMessage('สร้างฉบับร่างแล้ว');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถสร้างฉบับร่าง');
    } finally {
      setWorking(null);
    }
  }

  async function activateVersion(versionId: string) {
    setWorking(versionId);
    setError(null);
    try {
      // First validate the version
      const validateResponse = await fetch(
        `/api/templates/${params.id}/versions/${versionId}/validate`,
        { method: 'POST' },
      );
      const validateJson = await validateResponse.json();
      if (!validateJson.success || !validateJson.data.valid) {
        const errors = validateJson.data.errors ?? ['Validation failed'];
        throw new Error(`ไม่สามารถเผยแพร่เวอร์ชัน: ${errors.join('; ')}`);
      }

      const response = await fetch(`/api/templates/${params.id}/activate-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถเปิดใช้งานเวอร์ชัน');
      }
      await loadTemplate(params.id);
      setMessage('เปิดใช้งานเวอร์ชันแล้ว พร้อมสำหรับการสร้างเอกสาร');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถเปิดใช้งานเวอร์ชัน');
    } finally {
      setWorking(null);
    }
  }

  async function uploadVersion(file: File) {
    setWorking('upload');
    setError(null);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const response = await fetch(`/api/templates/${params.id}/upload`, {
        method: 'POST',
        body: payload,
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถอัปโหลดเวอร์ชัน');
      }
      await loadTemplate(params.id);
      setMessage('อัปโหลดเวอร์ชันเทมเพลตแล้ว');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถอัปโหลดเวอร์ชัน');
    } finally {
      setWorking(null);
    }
  }

  async function insertFieldMarkup(field: TemplateField) {
    const markup = field.isCollection
      ? createRepeatBlockMarkup(field.key)
      : createScalarFieldMarkup(field.key, field.label);
    activeEditorRef.current?.chain().focus().insertContent(markup).run();
    setMessage(`แทรก ${field.label} แล้ว`);
  }

  function jumpToField(field: TemplateField) {
    const editor = activeEditorRef.current;
    if (!editor) return;
    const fieldKey = field.key;
    // Search for the field key text inside the document
    let found = false;
    editor.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (node.isText && node.text?.includes(fieldKey)) {
        // Find the exact position of the key within this text node
        const textPos = pos + node.text!.indexOf(fieldKey);
        editor.chain().focus().setTextSelection(textPos).run();
        // Scroll the selection into view
        const domNode = editor.view.domAtPos(textPos);
        if (domNode.node?.parentElement) {
          domNode.node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        found = true;
        return false;
      }
    });
    if (!found) {
      setMessage(`ไม่พบฟิลด์ ${field.label} ในเอกสาร`);
    }
  }

  function selectStarter(starter: {
    name: string;
    type: typeof form.type;
    subject: string;
    description: string;
    body: string;
  }) {
    setForm((current) => ({
      ...current,
      name: starter.name,
      type: starter.type,
      subject: starter.subject,
      description: starter.description,
    }));
    setVersionContent(starter.body);
    setInitialVersionContent(starter.body);
    setStarterSelected(true);
  }

  const STARTERS = [
    {
      name: 'ใบแจ้งหนี้รายเดือน',
      type: 'INVOICE' as const,
      subject: 'ใบแจ้งหนี้ค่าเช่าห้องพัก',
      description: 'ใช้สำหรับแจ้งหนี้ค่าเช่ารายเดือน มีช่องแสดงรายการค่าใช้จ่ายแยกประเภท',
      body: `<div data-template-repeat="billing_items"><table style="width:100%;border-collapse:collapse;margin-bottom:12px;"><thead><tr style="background:#1c3860;color:#fff;"><th style="padding:8px 12px;text-align:left;font-size:14px;">รายการ</th><th style="padding:8px 12px;text-align:right;font-size:14px;">จำนวน (บาท)</th></tr></thead><tbody><tr><td style="padding:8px 12px;border-bottom:0.5px solid #e0e0e8;font-size:14px;"><span data-template-field="label" data-template-label="รายการ">ค่าเช่าห้อง</span></td><td style="padding:8px 12px;border-bottom:0.5px solid #e0e0e8;text-align:right;font-size:14px;"><span data-template-field="amount" data-template-label="จำนวนเงิน">{{billing.monthlyRent}}</span></td></tr></tbody></table></div>`,
    },
    {
      name: 'สัญญาเช่าที่พัก',
      type: 'CONTRACT' as const,
      subject: 'สัญญาเช่าห้องพัก',
      description: 'ใช้สำหรับทำสัญญาเช่าระหว่างเจ้าของห้องและผู้เช่า มีข้อมูลสำคัญครบถ้วน',
      body: `<h1 style="text-align:center;font-size:20px;font-weight:700;color:#1c3860;margin-bottom:8px;">สัญญาเช่าห้องพัก</h1>
<p style="text-align:center;font-size:14px;color:#555;margin-bottom:20px;">สัญญาเช่าฉบับนี้ทำขึ้นระหว่าง<span data-template-field="landlordName" data-template-label="ชื่อผู้ให้เช่า">{{landlord.name}}</span> (ผู้ให้เช่า) กับ <span data-template-field="tenantName" data-template-label="ชื่อผู้เช่า">{{tenant.fullName}}</span> (ผู้เช่า) ณ วันที่ <span data-template-field="signDate" data-template-label="วันที่ทำสัญญา">{{contract.signDate}}</span></p>
<div style="background:#f8f9fa;border:1.5px solid #1c3860;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
<p style="font-size:14px;line-height:1.8;margin:0;"><strong>ห้องพัก:</strong> <span data-template-field="roomLabel" data-template-label="หมายเลขห้อง">{{room.number}}</span> &nbsp;|&nbsp; <strong>ชั้น:</strong> <span data-template-field="floorName" data-template-label="ชื่อชั้น">{{floor.name}}</span></p>
<p style="font-size:14px;line-height:1.8;margin:4px 0 0;"><strong>ค่าเช่ารายเดือน:</strong> <span data-template-field="monthlyRent" data-template-label="ค่าเช่ารายเดือน">{{contract.monthlyRent}}</span> บาท &nbsp;|&nbsp; <strong>เงินประกัน:</strong> <span data-template-field="deposit" data-template-label="เงินประกัน">{{contract.deposit}}</span> บาท</p>
</div>
<p style="font-size:14px;line-height:1.8;text-align:justify;">ระยะเวลาเช่าเริ่มตั้งแต่วันที่ <span data-template-field="startDate" data-template-label="วันที่เริ่มเช่า">{{contract.startDate}}</span> ถึงวันที่ <span data-template-field="endDate" data-template-label="วันที่สิ้นสุด">{{contract.endDate}}</span></p>`,
    },
    {
      name: 'หนังสือแจ้งเตือนค่าเช่า',
      type: 'NOTICE' as const,
      subject: 'หนังสือแจ้งเตือนค่าเช่าค้างชำระ',
      description: 'ใช้สำหรับแจ้งเตือนผู้เช่าที่ค้างชำระค่าเช่า มีลักษณะเป็นทางการ',
      body: `<div style="background:#fef2f2;border:1.5px solid #ef4444;border-radius:8px;padding:14px 18px;margin-bottom:16px;">
  <div style="font-size:18px;font-weight:700;color:#991b1b;">แจ้งเตือนค่าเช่าค้างชำระ</div>
</div>
<p style="font-size:14px;line-height:1.8;margin-bottom:12px;">เรียน คุณ<span data-template-field="tenantName" data-template-label="ชื่อผู้เช่า">{{tenant.fullName}}</span> ห้องพัก <span data-template-field="roomLabel" data-template-label="หมายเลขห้อง">{{room.number}}</span></p>
<p style="font-size:14px;line-height:1.8;margin-bottom:12px;">ตามที่ท่านได้ทำสัญญาเช่าห้องพักกับทางเรานั้น ขณะนี้ทางเราพบว่าท่านค้างชำระค่าเช่างวดที่ <span data-template-field="billingPeriod" data-template-label="งวดที่">{{billing.period}}</span> จำนวนเงิน <span data-template-field="totalAmount" data-template-label="จำนวนเงิน">{{billing.totalAmount}}</span> บาท</p>`,
    },
    {
      name: 'ใบเสร็จรับเงิน',
      type: 'RECEIPT' as const,
      subject: 'ใบเสร็จรับเงิน',
      description: 'ใช้สำหรับออกใบเสร็จรับเงินค่าเช่าหรือค่าบริการอื่นๆ',
      body: `<div style="display:flex;gap:0;align-items:stretch;margin-bottom:16px;">
  <div style="flex:1;background:#f8fafc;border:1.5px solid #1c3860;border-right:none;border-radius:8px 0 0 8px;padding:14px 18px;">
    <div style="font-size:16px;font-weight:700;color:#1c3860;margin-bottom:8px;">รับเงินจาก / Received from</div>
    <div style="display:flex;gap:12px;font-size:15px;line-height:1.8;"><span style="color:#555;min-width:80px;">ชื่อ</span><span style="color:#1c3860;font-weight:600;"><span data-template-field="tenantName" data-template-label="ชื่อผู้เช่า">{{tenant.fullName}}</span></span></div>
    <div style="display:flex;gap:12px;font-size:15px;line-height:1.8;"><span style="color:#555;min-width:80px;">ห้อง</span><span style="color:#1c3860;font-weight:600;"><span data-template-field="roomLabel" data-template-label="หมายเลขห้อง">{{room.number}}</span></span></div>
  </div>
  <div style="background:#1c3860;color:#fff;border-radius:0 8px 8px 0;border:1.5px solid #1c3860;padding:16px 24px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;min-width:200px;text-align:center;">
    <span style="font-size:13px;color:#f29d21;font-weight:700;">จำนวนเงิน / AMOUNT</span>
    <span style="font-size:28px;font-weight:700;line-height:1;"><span data-template-field="amount" data-template-label="จำนวนเงิน">{{payment.amount}}</span></span>
  </div>
</div>`,
    },
  ];

  return (
    <main className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] px-6 py-5">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-violet-500/10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={isNew ? '/admin/templates' : `/admin/templates/${params.id}`} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]/70 hover:bg-[hsl(var(--primary))]/10 hover:text-[hsl(var(--card-foreground))] px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98]">
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </Link>
            <div>
              <h1 className="text-base font-semibold text-[hsl(var(--card-foreground))]">{isNew ? 'สร้างเทมเพลต' : 'พื้นที่แก้ไขเทมเพลต'}</h1>
              <p className="text-xs text-[hsl(var(--card-foreground))]/50 mt-0.5">
                จัดการข้อมูลเมตา เวอร์ชัน ฟิลด์ที่กำหนดโครงสร้าง และแก้ไขเนื้อหาด้วย TipTap
              </p>
            </div>
            {/* Presence indicator */}
            {!isNew && template && (
              <div className="flex items-center gap-2 rounded-full bg-[hsl(var(--card))] border border-[hsl(var(--glass-border))] px-3 py-1.5 backdrop-blur-sm">
                <div className="relative">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/30 text-emerald-600 text-xs font-bold border border-emerald-500/30">
                    A
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-[hsl(var(--card-foreground))] leading-tight">กำลังแก้ไข</span>
                  <span className="text-[10px] text-[hsl(var(--card-foreground))]/50 leading-tight">
                    {template.updatedAt ? new Date(template.updatedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                  </span>
                </div>
              </div>
            )}
          </div>
          {!isNew && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/templates/${params.id}/duplicate`, { method: 'POST' });
                  const json = await res.json();
                  if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถคัดลอกเทมเพลต');
                  const newId = json.data.id as string;
                  router.push(`/admin/templates/${newId}/edit`);
                } catch (nextError) {
                  setError(nextError instanceof Error ? nextError.message : 'ไม่สามารถคัดลอกเทมเพลต');
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]/70 hover:bg-[hsl(var(--primary))]/10 hover:text-[hsl(var(--card-foreground))] px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 active:scale-[0.98]"
            >
              <Copy className="h-4 w-4" />
              คัดลอกเทมเพลต
            </button>
          )}
        </div>
      </div>

      {message ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 backdrop-blur-sm">{message}</div> : null}
      {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 backdrop-blur-sm">{error}</div> : null}

      {loading ? (
        <div className="py-16 text-center text-sm text-[hsl(var(--card-foreground))]/40">กำลังโหลดพื้นที่เทมเพลต...</div>
      ) : isNew && !starterSelected ? (
        <div className="space-y-6">
          {/* Starter selection */}
          <section className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="px-6 py-5 border-b border-[hsl(var(--glass-border))]">
              <h2 className="text-base font-semibold text-[hsl(var(--card-foreground))]">เลือกเทมเพลตเริ่มต้น</h2>
              <p className="text-sm text-[hsl(var(--card-foreground))]/40 mt-1">เลือกประเภทเอกสารที่ต้องการสร้าง — ระบบจะเตรียมโครงสร้างและฟิลด์พื้นฐานให้อัตโนมัติ</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6">
              {/* Blank option */}
              <button
                type="button"
                onClick={() => selectStarter({ name: '', type: 'GENERAL_NOTICE', subject: '', description: '', body: '<p></p>' })}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] p-6 gap-3 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all duration-300 group"
              >
                <div className="h-14 w-14 rounded-xl bg-[hsl(var(--card))] flex items-center justify-center border border-[hsl(var(--glass-border))]">
                  <FilePlus2 className="h-7 w-7 text-[hsl(var(--card-foreground))]/30 group-hover:text-blue-600 transition-colors" />
                </div>
                <div className="text-center">
                  <div className="font-semibold text-[hsl(var(--card-foreground))]">เทมเพลตเปล่า</div>
                  <div className="text-xs text-[hsl(var(--card-foreground))]/40 mt-1">เริ่มจากกระดาษว่าง</div>
                </div>
              </button>

              {STARTERS.map((s) => (
                <button
                  key={s.type}
                  type="button"
                  onClick={() => selectStarter(s)}
                  className="flex flex-col items-center justify-center rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] p-5 gap-3 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all duration-300 group text-left"
                >
                  <div className="h-12 w-full rounded-lg bg-gradient-to-br from-blue-500/10 to-violet-500/10 flex items-center justify-center border border-[hsl(var(--glass-border))]">
                    <div className="text-sm font-bold text-blue-600">{s.type.replace(/_/g, ' ')}</div>
                  </div>
                  <div className="text-center w-full">
                    <div className="font-semibold text-[hsl(var(--card-foreground))] text-sm">{s.name}</div>
                    <div className="text-xs text-[hsl(var(--card-foreground))]/40 mt-1 leading-relaxed">{s.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Metadata Section */}
          <section className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))] bg-[hsl(var(--card))]">
              <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">ตั้งค่าเทมเพลต</div>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]/70">ชื่อเทมเพลต</label>
                <input
                  className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--card-foreground))]/30 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="ใบแจ้งหนี้รายเดือน"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]/70">ประเภท</label>
                <select
                  className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                  value={form.type}
                  onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                >
                  {TEMPLATE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]/70">หัวข้อ</label>
                <input
                  className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--card-foreground))]/30 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                  value={form.subject}
                  onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="ใบแจ้งหนี้สำหรับห้อง {{room.number}}"
                />
              </div>
              <div className="lg:col-span-4">
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]/70">รายละเอียด</label>
                <textarea
                  className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--card-foreground))]/30 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200 min-h-[96px]"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="รายละเอียดว่าเทมเพลตนี้ใช้สำหรับอะไรและเมื่อใดควรสร้าง"
                />
              </div>
            </div>
            <div className="border-t border-[hsl(var(--glass-border))] px-5 py-4 bg-[hsl(var(--card))]">
              <button
                type="button"
                onClick={() => void saveMetadata()}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-600 px-4 py-2 text-sm font-medium shadow-sm transition-all duration-200 hover:bg-blue-500/30 hover:border-blue-500/50 active:scale-[0.98] disabled:opacity-50"
                disabled={saving}
              >
                <Save className="h-4 w-4" />
                {saving ? 'กำลังบันทึก...' : isNew ? 'สร้างเทมเพลต' : 'บันทึกการตั้งค่า'}
              </button>
            </div>
          </section>

          {!isNew ? (
            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-6">
                {/* Version Sidebar */}
                <section className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))] bg-[hsl(var(--card))]">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--card-foreground))]">
                        <Layers3 className="h-4 w-4 text-blue-600" />
                        เวอร์ชัน
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void createDraft()}
                          className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--primary))]/10 active:scale-[0.98]"
                          disabled={working === 'draft'}
                        >
                          <FilePlus2 className="h-3.5 w-3.5" />
                          {working === 'draft' ? 'กำลังสร้าง...' : 'ร่างใหม่'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowHistory(true)}
                          className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--primary))]/10 active:scale-[0.98]"
                        >
                          <History className="h-3.5 w-3.5" />
                          ประวัติ
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowComments(true)}
                          className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--card-foreground))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--primary))]/10 active:scale-[0.98]"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          ความเห็น
                        </button>
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".docx"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void uploadVersion(file);
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    {(template?.versions ?? []).map((version) => (
                      <div
                        key={version.id}
                        className={`rounded-xl border px-4 py-4 transition-all duration-200 ${
                          selectedVersionId === version.id
                            ? 'border-blue-500/30 bg-blue-500/10 shadow-[0_4px_16px_rgba(99,102,241,0.15)]'
                            : 'border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--glass-border))]'
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedVersionId(version.id)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-[hsl(var(--card-foreground))]">v{version.version}</div>
                              <div className="text-xs text-[hsl(var(--card-foreground))]/40">{version.fileType.toUpperCase()} · {version.status}</div>
                            </div>
                            {template?.activeVersionId === version.id ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold">ใช้งาน</span>
                            ) : null}
                          </div>
                        </button>
                        <div className="mt-3 flex gap-2">
                          {template?.activeVersionId !== version.id ? (
                            <button
                              type="button"
                              onClick={() => void activateVersion(version.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-600 shadow-sm transition-all duration-200 hover:bg-blue-500/20 flex-1 active:scale-[0.98]"
                              disabled={working === version.id}
                            >
                              {working === version.id ? 'กำลังเปิดใช้งาน...' : 'เปิดใช้งาน'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void loadTemplate(params.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Field Browser Sidebar */}
                <section className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))] bg-[hsl(var(--card))]">
                    <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">เบราว์เซอร์ฟิลด์</div>
                  </div>
                  <div className="px-4 pt-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--card-foreground))]/30" />
                      <input
                        type="text"
                        value={fieldSearch}
                        onChange={(e) => setFieldSearch(e.target.value)}
                        placeholder="ค้นหาฟิลด์..."
                        className="w-full rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] pl-9 pr-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--card-foreground))]/30 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-1 p-3">
                    {filteredGroupedFields.map(([group, fields]) => {
                      const isExpanded = expandedGroups.has(group) || !fieldSearch;
                      return (
                        <div key={group}>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(group)) next.delete(group);
                                else next.add(group);
                                return next;
                              });
                            }}
                            className="flex w-full items-center justify-between px-2 py-1.5 rounded-lg hover:bg-[hsl(var(--card))] transition-colors"
                          >
                            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[hsl(var(--card-foreground))]/30">{group}</span>
                            <ChevronDown className={`h-3.5 w-3.5 text-[hsl(var(--card-foreground))]/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          {isExpanded && (
                            <div className="mt-1 space-y-1.5 pl-1">
                              {fields.map((field) => (
                                <div key={field.key} className="rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-3 py-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="font-medium text-[hsl(var(--card-foreground))] text-sm leading-tight">{field.label}</div>
                                      <div className="mt-0.5 font-mono text-[10px] text-blue-600">{field.key}</div>
                                      {field.description ? (
                                        <div className="mt-1 text-xs text-[hsl(var(--card-foreground))]/40 leading-snug line-clamp-2">{field.description}</div>
                                      ) : null}
                                    </div>
                                    <div className="flex flex-col gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => void insertFieldMarkup(field)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-2 py-1 text-xs font-medium text-[hsl(var(--card-foreground))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--primary))]/10 active:scale-[0.98]"
                                      >
                                        <Copy className="h-3 w-3" />
                                        แทรก
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => jumpToField(field)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-2 py-1 text-xs font-medium text-[hsl(var(--card-foreground))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--primary))]/10 active:scale-[0.98]"
                                        title="ไปที่ฟิลด์ในเอกสาร"
                                      >
                                        <MapPin className="h-3 w-3" />
                                        ไปที่
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filteredGroupedFields.length === 0 && (
                      <div className="py-6 text-center text-sm text-[hsl(var(--card-foreground))]/40">ไม่พบฟิลด์ที่ค้นหา</div>
                    )}
                  </div>
                </section>

                {/* Images Section */}
                <section className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))] bg-[hsl(var(--card))]">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--card-foreground))]">
                        <Layers3 className="h-4 w-4 text-blue-600" />
                        รูปภาพในเทมเพลต
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/templates/${params.id}/images/trash`, { cache: 'no-store' });
                              const json = await res.json();
                              if (json.success && json.data?.length > 0) {
                                setTrashImages(json.data);
                                setShowTrash(true);
                              }
                            } catch { /* ignore */ }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--card-foreground))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--primary))]/10 active:scale-[0.98]"
                        >
                          <Layers3 className="h-3.5 w-3.5" />
                          ถังขยะ{trashImages.length > 0 ? ` (${trashImages.length})` : ''}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Active images grid */}
                  {galleryImages.length > 0 ? (
                    <div className="grid grid-cols-4 gap-2 p-4">
                      {galleryImages.map((img) => (
                        <div key={img.id} className="group relative rounded-xl border border-[hsl(var(--glass-border))] overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.imageUrl} alt={img.originalName} className="h-16 w-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch(`/api/templates/${params.id}/images/${img.id}/actions`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'archive' }),
                                });
                                setGalleryImages((prev) => prev.filter((g) => g.id !== img.id));
                              }}
                              className="rounded-lg bg-red-500/80 p-1 text-[hsl(var(--card-foreground))] hover:bg-red-600 transition-colors"
                              title="ลบรูป"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                            <div className="truncate text-[9px] text-[hsl(var(--card-foreground))]">{img.originalName}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-sm text-[hsl(var(--card-foreground))]/40">ยังไม่มีรูปในเทมเพลตนี้</div>
                  )}

                  {/* Trash section */}
                  {showTrash && trashImages.length > 0 ? (
                    <div className="border-t border-[hsl(var(--glass-border))] space-y-3 p-4">
                      <div className="text-xs font-semibold text-red-600 uppercase tracking-wider">รูปในถังขยะ</div>
                      {trashImages.map((img) => (
                        <div key={img.id} className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover border border-[hsl(var(--glass-border))]" />
                          <div className="flex-1 min-w-0">
                            <div className="truncate text-xs font-medium text-[hsl(var(--card-foreground))]">{img.originalName}</div>
                            <div className="text-[10px] text-[hsl(var(--card-foreground))]/40">{Math.round(img.size / 1024)} KB</div>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch(`/api/templates/${params.id}/images/${img.id}/actions`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'restore' }),
                                });
                                setTrashImages((prev) => prev.filter((t) => t.id !== img.id));
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 shadow-sm transition-all duration-200 hover:bg-emerald-500/20 active:scale-[0.98]"
                            >
                              <Layers3 className="h-3 w-3" />
                              คืนค่า
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch(`/api/templates/${params.id}/images/${img.id}`, { method: 'DELETE' });
                                setTrashImages((prev) => prev.filter((t) => t.id !== img.id));
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 shadow-sm transition-all duration-200 hover:bg-red-500/20 active:scale-[0.98]"
                            >
                              <X className="h-3 w-3" />
                              ลบ
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : showTrash ? (
                    <div className="p-6 text-center text-sm text-[hsl(var(--card-foreground))]/40">ไม่มีรูปในถังขยะ</div>
                  ) : null}
                </section>

                {!isNew && selectedVersionId && (
                  <CommentPanel
                    templateId={params.id}
                    versionId={selectedVersionId}
                    editor={activeEditorRef.current}
                  />
                )}

              </div>

              {/* Editor Section */}
              <section className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))] flex items-center justify-between bg-[hsl(var(--card))]">
                  <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">ตัวแก้ไขเทมเพลต</div>
                  <div className="flex items-center gap-2">
                    {saveStatus === 'saving' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/20 px-2.5 py-0.5 text-xs font-medium">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        กำลังบันทึก...
                      </span>
                    )}
                    {saveStatus === 'saved' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-medium">
                        <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        บันทึกแล้ว
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]/60 border border-[hsl(var(--glass-border))] px-2.5 py-0.5 text-xs font-semibold">
                      {selectedVersionId ? `เวอร์ชัน ${template?.versions?.find((version) => version.id === selectedVersionId)?.version ?? '-'}` : 'ยังไม่เลือกเวอร์ชัน'}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  {contentLoading ? (
                    <div className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-6 py-20 text-center text-sm text-[hsl(var(--card-foreground))]/40">
                      กำลังโหลด...
                    </div>
                  ) : selectedVersionId ? (
                    <ClientOnly
                      fallback={
                        <div className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-6 py-20 text-center text-sm text-[hsl(var(--card-foreground))]/40">
                          กำลังเริ่มตัวแก้ไข...
                        </div>
                      }
                    >
                      <ErrorBoundary
                        fallback={
                          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-12 text-center">
                            <p className="text-sm font-medium text-red-600 mb-1">ไม่สามารถโหลดตัวแก้ไขเทมเพลต</p>
                            <p className="text-xs text-red-600/70">อาจเกิดจากตารางในเอกสารเดิมไม่สมบูรณ์ ลองลบตารางในเทมเพลตแล้วสร้างใหม่</p>
                          </div>
                        }
                      >
                        <TemplateWordEditor
                          value={versionContent}
                          subject={versionSubject}
                          previewValues={Object.fromEntries((template?.fields ?? []).map((f) => [f.key, f.label]))}
                          templateId={isNew ? undefined : params.id}
                          editorRef={activeEditorRef}
                          onChange={(html) => {
                            setVersionContent(html);
                            scheduleContentSave(html);
                          }}
                          onUploadImage={async (file: File) => {
                            const fd = new FormData();
                            fd.append('file', file);
                            const res = await fetch(`/api/templates/${params.id}/upload-image`, { method: 'POST', body: fd });
                            const json = await res.json();
                            if (!json.success) throw new Error(json.error?.message ?? 'Upload failed');
                            return { url: json.data.url, name: file.name };
                          }}
                        />
                      </ErrorBoundary>
                    </ClientOnly>
                  ) : (
                    <div className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-6 py-20 text-center text-sm text-[hsl(var(--card-foreground))]/40">
                      เลือกหรือสร้างเวอร์ชันเพื่อเริ่มแก้ไข
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-1">
              <section className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))] bg-[hsl(var(--card))]">
                  <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">ตัวแก้ไขเทมเพลต (TipTap)</div>
                </div>
                <div className="p-5 flex flex-col items-center justify-center py-20 min-h-[400px]">
                  <Layers3 className="h-10 w-10 text-blue-600/40 mb-4" />
                  <p className="font-semibold text-lg text-[hsl(var(--card-foreground))] mb-2">เริ่มสร้างเทมเพลตเอกสาร</p>
                  <p className="text-sm text-[hsl(var(--card-foreground))]/40 text-center max-w-sm">
                    กรุณาระบุชื่อและข้อมูลเทมเพลตในกล่องด้านบน จากนั้นกดปุ่ม <strong className="text-[hsl(var(--card-foreground))]/70">สร้างเทมเพลต</strong> เพื่อบันทึกและเปิดใช้งานหน้าต่างแก้ไขเนื้อหาเอกสาร (TipTap)
                  </p>
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {/* Version History Modal */}
      {showHistory && (
        <VersionHistoryModal
          templateId={params.id}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Comment Panel */}
      {showComments && (
        <CommentPanel
          templateId={params.id}
          versionId={selectedVersionId ?? undefined}
          editor={activeEditorRef.current}
          onClose={() => setShowComments(false)}
        />
      )}
    </main>
  );
}
