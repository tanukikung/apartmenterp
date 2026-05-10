'use client';

import { useState, useRef, useEffect } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setVisible(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [visible]);

  const positionClass = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[side];

  const arrowClass = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-[hsl(var(--color-surface-elevated,var(--color-surface)))] border-x-transparent border-b-transparent border-4',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-[hsl(var(--color-surface-elevated,var(--color-surface)))] border-x-transparent border-t-transparent border-4',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-[hsl(var(--color-surface-elevated,var(--color-surface)))] border-y-transparent border-r-transparent border-4',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-[hsl(var(--color-surface-elevated,var(--color-surface)))] border-y-transparent border-l-transparent border-4',
  }[side];

  return (
    <div ref={ref} className={`relative inline-flex ${className ?? ''}`}>
      <div
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="inline-flex"
      >
        {children}
      </div>

      {visible && (
        <div
          role="tooltip"
          className={`pointer-events-none absolute z-50 max-w-xs rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-xs text-[hsl(var(--on-surface))] shadow-lg ${positionClass}`}
        >
          {content}
          <span className={`absolute border ${arrowClass}`} />
        </div>
      )}
    </div>
  );
}

interface HelpIconProps {
  content: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function HelpIcon({ content, side = 'top', className }: HelpIconProps) {
  return (
    <Tooltip content={content} side={side} className={className}>
      <button
        type="button"
        aria-label="ข้อมูลเพิ่มเติม"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[10px] font-bold text-[hsl(var(--on-surface-variant))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors"
      >
        ?
      </button>
    </Tooltip>
  );
}
