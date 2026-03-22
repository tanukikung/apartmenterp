'use client';

import { Check } from 'lucide-react';

interface Step {
  number: number;
  label: string;
  shortLabel: string;
}

const STEPS: Step[] = [
  { number: 1, label: 'บัญชีผู้ดูแล', shortLabel: 'ผู้ดูแล' },
  { number: 2, label: 'ข้อมูลอาคารและห้องพัก', shortLabel: 'อาคาร/ห้อง' },
  { number: 3, label: 'นโยบายการเรียกเก็บ', shortLabel: 'Billing' },
  { number: 4, label: 'OnlyOFFICE (ตัวเลือก)', shortLabel: 'เอกสาร' },
  { number: 5, label: 'สรุปและเริ่มต้น', shortLabel: 'สรุป' },
];

interface StepIndicatorProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
  completedSteps?: number[];
}

export function StepIndicator({ currentStep, onStepClick, completedSteps = [] }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-center justify-between gap-1 sm:gap-2">
        {STEPS.map((step) => {
          const isCompleted = completedSteps.includes(step.number);
          const isCurrent = currentStep === step.number;
          const isClickable = onStepClick && (isCompleted || step.number < currentStep);

          return (
            <li key={step.number} className="flex-1">
              <button
                type="button"
                onClick={() => isClickable && onStepClick(step.number)}
                disabled={!isClickable}
                className={[
                  'flex flex-col items-center gap-1 w-full rounded-lg p-2 transition-all',
                  isClickable ? 'cursor-pointer hover:bg-surface-container' : 'cursor-default',
                  isCurrent ? 'bg-primary-container' : 'bg-transparent',
                ].join(' ')}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div className="flex items-center justify-center">
                  <span
                    className={[
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-2 transition-all',
                      isCompleted
                        ? 'bg-primary text-on-primary ring-primary'
                        : isCurrent
                        ? 'border-2 border-primary text-primary bg-transparent'
                        : 'border-2 border-outline text-on-surface-variant bg-transparent',
                    ].join(' ')}
                  >
                    {isCompleted ? <Check className="h-4 w-4" strokeWidth={2.5} /> : step.number}
                  </span>
                </div>
                <span
                  className={[
                    'hidden text-xs font-medium text-center leading-tight sm:block',
                    isCurrent
                      ? 'text-on-primary-container'
                      : isCompleted
                      ? 'text-primary'
                      : 'text-on-surface-variant',
                  ].join(' ')}
                >
                  {step.label}
                </span>
                <span
                  className={[
                    'block text-xs font-medium text-center sm:hidden',
                    isCurrent
                      ? 'text-on-primary-container'
                      : isCompleted
                      ? 'text-primary'
                      : 'text-on-surface-variant',
                  ].join(' ')}
                >
                  {step.shortLabel}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
