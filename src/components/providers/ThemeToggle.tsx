'use client';

import { useTheme } from './theme-provider';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={className}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? (
        <Sun size={18} className="text-amber-400" strokeWidth={2} />
      ) : (
        <Moon size={18} className="text-slate-500" strokeWidth={2} />
      )}
    </button>
  );
}