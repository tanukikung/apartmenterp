'use client';

import React, { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  FileText,
  Upload,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 1 | 2 | 3;

interface PreviewRow {
  index: number;
  col1: string;
  col2: string;
  col3: string;
  col4: string;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS: { n: WizardStep; label: string }[] = [
  { n: 1, label: 'Select File' },
  { n: 2, label: 'Preview' },
  { n: 3, label: 'Import' },
];

function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <div className="flex items-center mb-8">
      {STEPS.map((step, idx) => {
        const done = current > step.n;
        const active = current === step.n;
        return (
          <React.Fragment key={step.n}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                  done
                    ? 'bg-green-600 border-green-600 text-white'
                    : active
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {done ? <CheckCircle className="w-4 h-4" /> : step.n}
              </div>
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mt-[-14px] ${
                  current > step.n ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV parser — reads actual file content for preview (first 10 data rows)
// ---------------------------------------------------------------------------

/**
 * Parses a CSV string and returns up to `maxRows` data rows as PreviewRow[].
 * Handles quoted fields with embedded commas.
 */
function parseCsvToPreviewRows(csvText: string, maxRows = 10): PreviewRow[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: PreviewRow[] = [];

  for (let i = 0; i < Math.min(lines.length, maxRows + 1); i++) {
    const line = lines[i];
    // Minimal CSV split: split on commas not inside quotes
    const cells: string[] = [];
    let current = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());

    rows.push({
      index: i + 1,
      col1: cells[0] ?? '',
      col2: cells[1] ?? '',
      col3: cells[2] ?? '',
      col4: cells[3] ?? '',
    });
  }

  return rows;
}

/**
 * Reads a File and resolves preview rows.
 * CSV files are parsed client-side.
 * Excel files cannot be parsed without a library — returns empty (import still works).
 */
function readFilePreview(file: File): Promise<PreviewRow[]> {
  return new Promise((resolve) => {
    if (!file.name.endsWith('.csv')) {
      // xlsx — skip client-side preview, import will still parse server-side
      resolve([]);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      resolve(parseCsvToPreviewRows(text, 10));
    };
    reader.onerror = () => resolve([]);
    reader.readAsText(file);
  });
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function UploadStatementPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Drag & drop handlers
  // -------------------------------------------------------------------------

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setSelectedFile(dropped);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  // -------------------------------------------------------------------------
  // Wizard navigation
  // -------------------------------------------------------------------------

  const handleNext = async () => {
    setErrorMessage(null);
    if (step === 1) {
      if (!selectedFile) {
        setErrorMessage('Please select a file before continuing.');
        return;
      }
      const rows = await readFilePreview(selectedFile);
      setPreviewRows(rows);
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  // -------------------------------------------------------------------------
  // Process import
  // -------------------------------------------------------------------------

  const handleProcessImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/payments/statement-upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setErrorMessage(json?.error?.message ?? `Upload failed with status ${res.status}.`);
        return;
      }

      const json = await res.json() as {
        success?: boolean;
        data?: { totalEntries?: number; imported?: number; matched?: number; unmatched?: number };
      };
      if (json.success === false) {
        setErrorMessage('The server rejected the upload. Please check the file format and try again.');
        return;
      }

      const imported = json?.data?.imported ?? 0;
      const matched = json?.data?.matched ?? 0;
      const unmatched = json?.data?.unmatched ?? 0;
      setSuccessMessage(
        `Statement imported: ${imported} transaction(s) saved. ${matched} auto-matched, ${unmatched} pending review.`,
      );
    } catch {
      setErrorMessage('A network error occurred. Please check your connection and try again.');
    } finally {
      setImporting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Reset wizard
  // -------------------------------------------------------------------------

  const handleReset = () => {
    setStep(1);
    setSelectedFile(null);
    setPreviewRows([]);
    setSuccessMessage(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div>
          <Link
            href="/admin/payments"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Payments
          </Link>
          <h1 className="admin-page-title">Upload Bank Statement</h1>
          <p className="admin-page-subtitle">
            Import CSV or Excel bank statements to match against outstanding invoices.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto p-6">
        <StepIndicator current={step} />

        {/* Error / success banners */}
        {errorMessage && (
          <div className="auth-alert auth-alert-error mb-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="auth-alert auth-alert-success mb-4 flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* STEP 1: Select File                                              */}
        {/* ---------------------------------------------------------------- */}
        {step === 1 && (
          <div className="admin-card space-y-6">
            <div className="admin-card-header">
              <h2 className="admin-card-title">Step 1: Select File</h2>
              <span className="admin-badge">CSV / Excel</span>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 cursor-pointer transition-colors ${
                dragging
                  ? 'border-blue-400 bg-blue-50'
                  : selectedFile
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={handleFileChange}
              />
              {selectedFile ? (
                <>
                  <FileText className="h-12 w-12 text-green-500" />
                  <p className="text-base font-medium text-green-700">{selectedFile.name}</p>
                  <p className="text-sm text-green-600">
                    {(selectedFile.size / 1024).toFixed(1)} KB &mdash; click to change
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-12 w-12 text-gray-400" />
                  <p className="text-base font-medium text-gray-700">
                    Click to browse or drag &amp; drop
                  </p>
                  <p className="text-sm text-gray-400">
                    Supported: CSV, Excel (.xlsx) &middot; Max 10MB
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleNext}
                className="admin-button admin-button-primary"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* STEP 2: Preview                                                  */}
        {/* ---------------------------------------------------------------- */}
        {step === 2 && selectedFile && (
          <div className="admin-card space-y-6">
            <div className="admin-card-header">
              <h2 className="admin-card-title">Step 2: Preview</h2>
              <span className="admin-badge">{selectedFile.name}</span>
            </div>

            {/* File summary */}
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <FileText className="w-5 h-5 text-gray-400 shrink-0" />
              <div>
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-gray-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB &middot; Processing complete
                </p>
              </div>
            </div>

            {/* Preview table */}
            {previewRows.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="font-medium text-gray-700">Preview not available for Excel files</p>
                <p className="text-xs text-gray-400 mt-1">
                  The file will be fully parsed during import. Proceed to the next step.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">#</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Col 1</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Col 2</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Col 3</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Col 4</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {previewRows.map((row) => (
                        <tr
                          key={row.index}
                          className={row.index === 1 ? 'bg-gray-50 font-medium text-gray-500' : 'text-gray-800'}
                        >
                          <td className="px-4 py-2.5 text-gray-400 text-xs">{row.index}</td>
                          <td className="px-4 py-2.5">{row.col1}</td>
                          <td className="px-4 py-2.5">{row.col2}</td>
                          <td className="px-4 py-2.5 text-right">{row.col3}</td>
                          <td className="px-4 py-2.5">{row.col4}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400">
                  Showing first {previewRows.length} row(s) from file. Full processing happens on import.
                </p>
              </>
            )}

            <div className="flex items-center justify-between">
              <button onClick={handleBack} className="admin-button">
                Back
              </button>
              <button onClick={handleNext} className="admin-button admin-button-primary">
                Next
              </button>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* STEP 3: Import                                                   */}
        {/* ---------------------------------------------------------------- */}
        {step === 3 && (
          <div className="admin-card space-y-6">
            <div className="admin-card-header">
              <h2 className="admin-card-title">Step 3: Import</h2>
            </div>

            {successMessage ? (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <CheckCircle className="w-14 h-14 text-green-500" />
                <div>
                  <p className="text-lg font-semibold text-green-800">Import Successful</p>
                  <p className="text-sm text-green-700 mt-1">{successMessage}</p>
                </div>
                <div className="flex gap-3 mt-2">
                  <Link href="/admin/payments/review" className="admin-button admin-button-primary">
                    Review Queue
                  </Link>
                  <Link href="/admin/payments" className="admin-button">
                    All Payments
                  </Link>
                  <button onClick={handleReset} className="admin-button">
                    Upload Another
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-700 space-y-2">
                  <p className="font-medium text-gray-900">Ready to import:</p>
                  {selectedFile && (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span>{selectedFile.name}</span>
                      <span className="text-gray-400">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  )}
                  <p className="text-gray-500 text-xs">
                    The system will attempt to match each transaction against outstanding invoices.
                    Unmatched transactions will be queued for manual review.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <button onClick={handleBack} className="admin-button" disabled={importing}>
                    Back
                  </button>
                  <button
                    onClick={handleProcessImport}
                    disabled={importing}
                    className="admin-button admin-button-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? (
                      <>
                        <svg
                          className="w-4 h-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z"
                          />
                        </svg>
                        Processing…
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Process Import
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
