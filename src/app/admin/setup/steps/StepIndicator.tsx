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
  { number: 4, label: 'สรุปและเริ่มต้น', shortLabel: 'สรุป' },
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
                  'flex flex-col items-center gap-1 w-full rounded-xl p-2 transition-all',
                  isClickable ? 'cursor-pointer' : 'cursor-default',
                  isCurrent ? 'bg-primary/10 border border-primary/30' : 'bg-transparent border border-transparent',
                ].join(' ')}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <div className="flex items-center justify-center">
                  <span
                    className={[
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all',
                      isCompleted
                        ? 'text-white'
                        : isCurrent
                        ? 'border-2 bg-transparent'
                        : 'border-2 bg-transparent',
                    ].join(' ')}
                    style={isCompleted
                      ? { background: 'hsl(var(--primary))', color: 'white' }
                      : isCurrent
                      ? { borderColor: 'hsl(var(--primary))', color: 'hsl(var(--primary))' }
                      : { borderColor: 'hsl(var(--color-border))', color: 'hsl(var(--color-text-3))' }}
                  >
                    {isCompleted ? <Check className="h-4 w-4" strokeWidth={2.5} /> : step.number}
                  </span>
                </div>
                <span
                  className={[
                    'hidden text-xs font-medium text-center leading-tight sm:block',
                    isCurrent
                      ? ''
                      : isCompleted
                      ? ''
                      : '',
                  ].join(' ')}
                  style={isCurrent
                    ? { color: 'hsl(var(--primary))' }
                    : isCompleted
                    ? { color: 'hsl(var(--color-text-2))' }
                    : { color: 'hsl(var(--color-text-3))' }}
                >
                  {step.label}
                </span>
                <span
                  className={[
                    'block text-xs font-medium text-center sm:hidden',
                  ].join(' ')}
                  style={isCurrent
                    ? { color: 'hsl(var(--primary))' }
                    : isCompleted
                    ? { color: 'hsl(var(--color-text-2))' }
                    : { color: 'hsl(var(--color-text-3))' }}
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
