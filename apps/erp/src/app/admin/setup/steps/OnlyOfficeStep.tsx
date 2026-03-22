'use client';

import { useState } from 'react';
import { FileText, Copy, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface OnlyOfficeStepProps {
  onSkip: () => void;
}

export function OnlyOfficeStep({ onSkip }: OnlyOfficeStepProps) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const dockerCommand = `docker run -d \\
  --name onlyoffice-document-server \\
  -p 8080:80 \\
  -p 8443:443 \\
  -e JWT_SECRET="your-jwt-secret-min-32-chars" \\
  onlyoffice/documentserver`;

  const envVars = `# Add to your .env file
ONLYOFFICE_DOCUMENT_SERVER_URL="http://localhost:8080"
ONLYOFFICE_JWT_SECRET="your-jwt-secret-min-32-chars"`

  const handleCopy = () => {
    navigator.clipboard.writeText(dockerCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestConnection = async () => {
    setStatus('checking');
    setErrorMessage('');

    try {
      const res = await fetch('/api/health/onlyoffice');
      const json = await res.json();

      if (json.success && json.data.connected) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(json.data?.error || 'ไม่สามารถเชื่อมต่อ OnlyOFFICE');
      }
    } catch {
      setStatus('error');
      setErrorMessage('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-on-surface">OnlyOFFICE Document Server</h2>
          <p className="text-sm text-on-surface-variant">ตั้งค่าเซิร์ฟเวอร์สำหรับแก้ไขเอกสารออนไลน์ (ตัวเลือก)</p>
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-5 space-y-5">
        <div className="flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-200 p-4">
          <FileText className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">OnlyOFFICE Document Server คืออะไร?</p>
            <p className="mt-1 text-blue-700">
              เป็นเซิร์ฟเวอร์สำหรับแก้ไขเอกสาร (Word, Excel, PowerPoint) ออนไลน์ผ่านเบราว์เซอร์
              ช่วยให้ผู้เช่าและเจ้าของอาคารสามารถเซ็นสัญญาเช่าและเอกสารอื่นๆ ได้โดยไม่ต้องพิมพ์
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-on-surface mb-2">ขั้นตอนการติดตั้ง</h3>
          <ol className="text-sm text-on-surface-variant space-y-2 list-decimal list-inside">
            <li>ติดตั้ง Docker บนเซิร์ฟเวอร์ของคุณ</li>
            <li>รันคำสั่งด้านล่างเพื่อสร้าง OnlyOFFICE container</li>
            <li>กรอก URL และ JWT Secret ในไฟล์ .env</li>
            <li>รอจนเซิร์ฟเวอร์พร้อมใช้งาน (ประมาณ 30 วินาที)</li>
          </ol>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-on-surface">Docker Command</h3>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
            </button>
          </div>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto whitespace-pre-wrap">
            {dockerCommand}
          </pre>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-on-surface mb-2">Environment Variables</h3>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto">
            {envVars}
          </pre>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTestConnection}
            disabled={status === 'checking'}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {status === 'checking' && <Loader2 className="h-4 w-4 animate-spin" />}
            {status === 'checking' ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
          </button>

          {status === 'success' && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              เชื่อมต่อสำเร็จ
            </span>
          )}

          {status === 'error' && (
            <span className="flex items-center gap-1.5 text-sm text-red-600">
              <XCircle className="h-4 w-4" />
              {errorMessage}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-on-surface-variant">
          คุณสามารถข้ามขั้นตอนนี้และตั้งค่า OnlyOFFICE ภายหลังได้
        </p>
        <button
          onClick={onSkip}
          className="flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container transition-colors"
        >
          ข้าม
        </button>
      </div>
    </div>
  );
}
