'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useSetupWizard } from './hooks/useSetupWizard';
import { StepIndicator } from './steps/StepIndicator';
import { AdminAccountStep } from './steps/AdminAccountStep';
import { BuildingRoomsStep } from './steps/BuildingRoomsStep';
import { BillingPolicyStep } from './steps/BillingPolicyStep';
import { ReviewStep } from './steps/ReviewStep';

export default function SetupPage() {
  const router = useRouter();
  const [statusLoading, setStatusLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});

  const {
    state,
    updateAdmin,
    updateBuilding,
    updateRooms,
    updateBankAccount,
    updateBilling,
    updateLineNotify,
    updateEmailNotify,
    nextStep,
    prevStep,
    goToStep,
  } = useSetupWizard();

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [submitResult, setSubmitResult] = useState<{ adminUserId: string; roomsCreated: number } | null>(null);

  useEffect(() => {
    async function checkStatus() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch('/api/admin/setup/status', { signal: controller.signal });
        clearTimeout(timeoutId);
        const json = await res.json();
        if (json.success) {
          if (json.data.initialized) {
            router.replace('/admin/dashboard');
            return;
          }
        } else {
          router.replace('/admin/dashboard');
          return;
        }
      } catch {
        clearTimeout(timeoutId);
        router.replace('/admin/dashboard');
        return;
      } finally {
        setStatusLoading(false);
      }
    }
    checkStatus();
  }, [router]);

  function validateStep(step: number): boolean {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 1:
        if (!state.admin.username || state.admin.username.length < 3) {
          newErrors.username = 'Username ต้องมีอย่างน้อย 3 ตัวอักษร';
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(state.admin.username)) {
          newErrors.username = 'Username ประกอบด้วย a-z, A-Z, 0-9, ., _, - เท่านั้น';
        }
        if (!state.admin.displayName || state.admin.displayName.length < 2) {
          newErrors.displayName = 'Display Name ต้องมีอย่างน้อย 2 ตัวอักษร';
        }
        if (!state.admin.password || state.admin.password.length < 8) {
          newErrors.password = 'Password ต้องมีอย่างน้อย 8 ตัวอักษร';
        }
        if (state.admin.password !== state.admin.confirmPassword) {
          newErrors.confirmPassword = 'Password ไม่ตรงกัน';
        }
        break;

      case 2:
        if (!state.building.name) {
          newErrors.name = 'กรุณากรอกชื่ออาคาร';
        }
        if (!state.building.address) {
          newErrors.address = 'กรุณากรอกที่อยู่';
        }
        if (!state.building.phone) {
          newErrors.phone = 'กรุณากรอกเบอร์โทร';
        }
        break;

      case 3:
        if (state.billing.billingDay < 1 || state.billing.billingDay > 28) {
          newErrors.billingDay = 'วันออกบิลต้องอยู่ระหว่าง 1-28';
        }
        if (state.billing.dueDay < 1 || state.billing.dueDay > 31) {
          newErrors.dueDay = 'วันครบกำหนดต้องอยู่ระหว่าง 1-31';
        }
        break;
    }

    setErrors({ [step]: newErrors });
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError('');

    try {
      const payload = {
        admin: {
          username: state.admin.username,
          displayName: state.admin.displayName,
          password: state.admin.password,
        },
        building: {
          name: state.building.name,
          address: state.building.address,
          phone: state.building.phone,
          email: state.building.email,
          taxId: state.building.taxId,
        },
        rooms: {
          format: state.rooms.format,
          floors: state.rooms.floors,
          roomsPerFloor: state.rooms.roomsPerFloor,
          defaultRentAmount: state.rooms.defaultRentAmount,
          prefix: state.rooms.prefix,
          mixedSpecialFloor: state.rooms.mixedSpecialFloor,
          customRooms: state.rooms.customRooms,
        },
        bankAccount: {
          bankName: state.bankAccount.bankName,
          bankAccountNo: state.bankAccount.bankAccountNo,
          bankAccountName: state.bankAccount.bankAccountName,
          promptpay: state.bankAccount.promptpay,
        },
        billing: {
          billingDay: state.billing.billingDay,
          dueDay: state.billing.dueDay,
          reminderDays: state.billing.reminderDays,
          lateFeePerDay: state.billing.lateFeePerDay,
        },
        lineNotify: state.lineNotify.enabled
          ? {
              enabled: true,
              channelId: state.lineNotify.channelId || undefined,
              channelSecret: state.lineNotify.channelSecret || undefined,
              accessToken: state.lineNotify.accessToken || undefined,
            }
          : { enabled: false },
        emailNotify: state.emailNotify.enabled
          ? {
              enabled: true,
              smtpHost: state.emailNotify.smtpHost || undefined,
              smtpPort: state.emailNotify.smtpPort ? parseInt(state.emailNotify.smtpPort) : undefined,
              smtpUser: state.emailNotify.smtpUser || undefined,
              smtpPass: state.emailNotify.smtpPass || undefined,
              fromEmail: state.emailNotify.fromEmail || undefined,
            }
          : { enabled: false },
      };

      const res = await fetch('/api/admin/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error?.message || 'เกิดข้อผิดพลาดในการตั้งค่าระบบ');
      }

      setSubmitResult(json.data);

      setTimeout(() => {
        router.replace('/admin/dashboard');
      }, 3000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (validateStep(state.currentStep)) {
      nextStep();
    }
  }

  if (statusLoading) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'hsl(var(--primary))' }} />
          <p className="text-sm" style={{ color: 'hsl(var(--color-text-3))' }}>กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen py-6 px-4" style={{ background: 'hsl(var(--color-bg))' }}>
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'hsl(var(--color-text))' }}>ตั้งค่าระบบ Apartment ERP</h1>
          <p className="text-sm" style={{ color: 'hsl(var(--color-text-3))' }}>
            กำหนดค่าเริ่มต้นสำหรับระบบจัดการอาคารของคุณ
          </p>
        </div>

        {/* Step Indicator */}
        {!submitResult && (
          <StepIndicator
            currentStep={state.currentStep}
            onStepClick={(step) => {
              if (step < state.currentStep) {
                goToStep(step);
              }
            }}
            completedSteps={Array.from({ length: state.currentStep - 1 }, (_, i) => i + 1)}
          />
        )}

        {/* Step Content */}
        <div className="rounded-2xl border p-6" style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          {state.currentStep === 1 && (
            <AdminAccountStep
              data={state.admin}
              onChange={updateAdmin}
              errors={errors[1]}
            />
          )}

          {state.currentStep === 2 && (
            <BuildingRoomsStep
              building={state.building}
              rooms={state.rooms}
              bankAccount={state.bankAccount}
              onBuildingChange={updateBuilding}
              onRoomsChange={updateRooms}
              onBankAccountChange={updateBankAccount}
              errors={errors[2]}
            />
          )}

          {state.currentStep === 3 && (
            <BillingPolicyStep
              billing={state.billing}
              lineNotify={state.lineNotify}
              emailNotify={state.emailNotify}
              onBillingChange={updateBilling}
              onLineNotifyChange={updateLineNotify}
              onEmailNotifyChange={updateEmailNotify}
              errors={errors[3]}
            />
          )}

          {state.currentStep === 4 && (
            <ReviewStep
              state={state}
              onSubmit={handleSubmit}
              isSubmitting={submitting}
              submitError={submitError}
              submitResult={submitResult || undefined}
            />
          )}
        </div>

        {/* Navigation Buttons */}
        {!submitResult && state.currentStep < 4 && (
          <div className="flex items-center justify-between">
            <button
              onClick={prevStep}
              disabled={state.currentStep === 1}
              className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: 'hsl(var(--color-border))', background: 'hsl(var(--color-surface))', color: 'hsl(var(--color-text-2))' }}
            >
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </button>

            <button
              onClick={handleNext}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-all"
              style={{ background: 'hsl(var(--primary))' }}
            >
              ต่อไป
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {!submitResult && state.currentStep === 5 && (
          <div className="flex items-center justify-between">
            <button
              onClick={prevStep}
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:scale-105 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
