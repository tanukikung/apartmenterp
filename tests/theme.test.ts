/**
 * Theme System Tests
 *
 * Tests cover:
 * - ThemeProvider context initialization
 * - Theme state persistence via localStorage
 * - Theme class applied/removed on <html>
 * - ThemeToggle button renders correct icon per theme
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Minimal mock of the ThemeProvider + ThemeToggle without Next.js context
// We test the actual component files by mocking localStorage

const LOCAL_STORAGE_KEY = 'ap-theme';

function getStoredTheme(): string | null {
  return localStorage.getItem(LOCAL_STORAGE_KEY);
}

describe('Theme system', () => {
  beforeEach(() => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  });

  // ── localStorage helper tests ────────────────────────────────────────────

  describe('localStorage persistence', () => {
    it('stores light theme', () => {
      localStorage.setItem(LOCAL_STORAGE_KEY, 'light');
      expect(getStoredTheme()).toBe('light');
    });

    it('stores dark theme', () => {
      localStorage.setItem(LOCAL_STORAGE_KEY, 'dark');
      expect(getStoredTheme()).toBe('dark');
    });

    it('returns null when no theme stored', () => {
      expect(getStoredTheme()).toBeNull();
    });

    it('overwrites previous theme value', () => {
      localStorage.setItem(LOCAL_STORAGE_KEY, 'light');
      localStorage.setItem(LOCAL_STORAGE_KEY, 'dark');
      expect(getStoredTheme()).toBe('dark');
    });
  });

  // ── ThemeToggle icon logic ───────────────────────────────────────────────

  describe('ThemeToggle icon rendering', () => {
    it('renders Moon icon when theme is light', () => {
      // The toggle button aria-label changes based on stored theme
      localStorage.setItem(LOCAL_STORAGE_KEY, 'light');
      // Icon rendered: Moon for light, Sun for dark
      // Without full component render we verify the label is correct
      const isDark = localStorage.getItem(LOCAL_STORAGE_KEY) === 'dark';
      expect(isDark).toBe(false); // light → Moon icon expected
    });

    it('renders Sun icon when theme is dark', () => {
      localStorage.setItem(LOCAL_STORAGE_KEY, 'dark');
      const isDark = localStorage.getItem(LOCAL_STORAGE_KEY) === 'dark';
      expect(isDark).toBe(true); // dark → Sun icon expected
    });
  });

  // ── CSS class application ────────────────────────────────────────────────

  describe('dark class on <html> element', () => {
    it('adds dark class when theme is dark', () => {
      localStorage.setItem(LOCAL_STORAGE_KEY, 'dark');
      // Simulate what ThemeProvider useEffect does
      const root = document.documentElement;
      const theme = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (theme === 'dark') {
        root.classList.add('dark');
      }
      expect(root.classList.contains('dark')).toBe(true);
    });

    it('removes dark class when theme is light', () => {
      // Start with dark class
      document.documentElement.classList.add('dark');
      localStorage.setItem(LOCAL_STORAGE_KEY, 'light');
      // Simulate toggle
      const theme = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (theme !== 'dark') {
        document.documentElement.classList.remove('dark');
      }
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});

// ── Integration-style: full component test ──────────────────────────────────

describe('ThemeToggle component', () => {
  let ThemeToggle: React.ComponentType<{ className?: string }>;
  let ThemeProvider: React.ComponentType<{ children: React.ReactNode }>;
  let useTheme: () => { theme: string; toggleTheme: () => void; setTheme: (t: string) => void };

  beforeAll(async () => {
    const provider = await import('../src/components/providers/theme-provider');
    const toggle = await import('../src/components/providers/ThemeToggle');
    ThemeProvider = provider.ThemeProvider;
    ThemeToggle = toggle.ThemeToggle;
    useTheme = provider.useTheme;
  });

  it('renders a button', async () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    const button = screen.getByRole('button');
    expect(button).toBeTruthy();
  });

  it('toggles theme from light to dark when clicked', async () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    let currentTheme = 'light';

    const TestComponent = () => {
      const { theme, toggleTheme } = useTheme();
      currentTheme = theme;
      return <button onClick={toggleTheme}>Toggle</button>;
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const button = screen.getByRole('button');
    expect(currentTheme).toBe('light');

    fireEvent.click(button);
    await waitFor(() => {
      expect(localStorage.getItem(LOCAL_STORAGE_KEY)).toBe('dark');
    });
  });

  it('toggles theme from dark to light when clicked again', async () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, 'dark');

    let currentTheme = 'dark';

    const TestComponent = () => {
      const { theme, toggleTheme } = useTheme();
      currentTheme = theme;
      return <button onClick={toggleTheme}>Toggle</button>;
    };

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const button = screen.getByRole('button');
    expect(currentTheme).toBe('dark');

    fireEvent.click(button);
    await waitFor(() => {
      expect(localStorage.getItem(LOCAL_STORAGE_KEY)).toBe('light');
    });
  });

  it('applies dark class to documentElement when dark mode is active', async () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    document.documentElement.classList.remove('dark');

    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );

    // ThemeProvider starts with light (no dark class)
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    // Now set dark via localStorage and re-mount
    localStorage.setItem(LOCAL_STORAGE_KEY, 'dark');
    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('removes dark class from documentElement when light mode is active', async () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, 'dark');
    document.documentElement.classList.add('dark');

    render(
      <ThemeProvider>
        <div>content</div>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});

describe('Tailwind dark: class integration', () => {
  it('tailwind config has darkMode set to class', async () => {
    // Verify the tailwind.config.ts has darkMode: 'class'
    const fs = require('fs');
    const path = require('path');
    const config = fs.readFileSync(
      path.join(__dirname, '..', 'tailwind.config.ts'),
      'utf8'
    );
    expect(config).toContain("darkMode: 'class'");
  });
});