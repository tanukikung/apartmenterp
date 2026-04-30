'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type AlertVariant = 'success' | 'error' | 'warning' | 'info';

interface AlertBannerProps {
  variant: AlertVariant;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const VARIANT_CONFIG: Record<AlertVariant, {
  borderColor: string;
  bgColor: string;
  textColor: string;
  icon: typeof CheckCircle2;
  iconColor: string;
}> = {
  success: {
    borderColor: 'border-emerald-500/30',
    bgColor: 'rgba(34,197,94,0.1)',
    textColor: '#4ade80',
    icon: CheckCircle2,
    iconColor: '#4ade80',
  },
  error: {
    borderColor: 'border-red-500/30',
    bgColor: 'rgba(239,68,68,0.1)',
    textColor: '#f87171',
    icon: XCircle,
    iconColor: '#f87171',
  },
  warning: {
    borderColor: 'border-amber-500/30',
    bgColor: 'rgba(251,191,36,0.08)',
    textColor: '#fbbf24',
    icon: AlertTriangle,
    iconColor: '#fbbf24',
  },
  info: {
    borderColor: 'border-blue-500/30',
    bgColor: 'rgba(59,130,246,0.1)',
    textColor: '#60a5fa',
    icon: Info,
    iconColor: '#60a5fa',
  },
};

export function AlertBanner({ variant, children, onDismiss, className = '' }: AlertBannerProps) {
  const cfg = VARIANT_CONFIG[variant];
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${cfg.borderColor} ${className}`}
      style={{ background: cfg.bgColor, color: cfg.textColor }}
    >
      <Icon className="h-5 w-5 shrink-0" style={{ color: cfg.iconColor }} />
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 transition-colors hover:bg-white/10"
          style={{ color: cfg.iconColor }}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </motion.div>
  );
}
