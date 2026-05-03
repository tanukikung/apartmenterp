import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Sarabun', 'Segoe UI', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        // Brand remap: indigo/purple/violet → Refined Bronze.
        // Hijacks every indigo/purple/violet utility across the app so all
        // pages pick up the new palette without per-file edits.
        indigo: {
          50:  'hsl(160 30% 96%)',
          100: 'hsl(160 28% 92%)',
          200: 'hsl(160 24% 84%)',
          300: 'hsl(162 24% 68%)',
          400: 'hsl(164 28% 48%)',
          500: 'hsl(165 35% 30%)',
          600: 'hsl(165 38% 24%)',
          700: 'hsl(165 42% 20%)',
          800: 'hsl(166 46% 15%)',
          900: 'hsl(166 50% 11%)',
          950: 'hsl(166 54% 7%)',
        },
        purple: {
          50:  'hsl(160 22% 95%)',
          100: 'hsl(160 18% 90%)',
          200: 'hsl(162 16% 82%)',
          300: 'hsl(164 16% 62%)',
          400: 'hsl(165 22% 38%)',
          500: 'hsl(165 32% 26%)',
          600: 'hsl(165 38% 20%)',
          700: 'hsl(166 44% 15%)',
          800: 'hsl(166 48% 11%)',
          900: 'hsl(166 52% 8%)',
          950: 'hsl(166 54% 5%)',
        },
        violet: {
          50:  'hsl(160 22% 95%)',
          100: 'hsl(160 18% 90%)',
          500: 'hsl(165 32% 26%)',
          600: 'hsl(165 38% 20%)',
          700: 'hsl(166 44% 15%)',
        },

        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          container: "hsl(var(--primary-container))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Material Design 3 / Indigo theme colors
        "surface-container-lowest": "hsl(var(--surface-container-lowest))",
        "surface-container-low": "hsl(var(--surface-container-low))",
        "surface-container": "hsl(var(--surface-container))",
        "surface-container-high": "hsl(var(--surface-container-high))",
        "surface-container-highest": "hsl(var(--surface-container-highest))",
        "on-surface": "hsl(var(--on-surface))",
        "on-surface-variant": "hsl(var(--on-surface-variant))",
        "on-primary": "hsl(var(--on-primary))",
        "on-primary-container": "hsl(var(--on-primary-container))",
        "tertiary-container": "hsl(var(--tertiary-container))",
        "on-tertiary-container": "hsl(var(--on-tertiary-container))",
        "tertiary-fixed": "hsl(var(--tertiary-fixed))",
        "tertiary-fixed-dim": "hsl(var(--tertiary-fixed-dim))",
        "on-tertiary-fixed": "hsl(var(--on-tertiary-fixed))",
        "on-tertiary-fixed-variant": "hsl(var(--on-tertiary-fixed-variant))",
        "error-container": "hsl(var(--error-container))",
        "on-error-container": "hsl(var(--on-error-container))",
        "secondary-container": "hsl(var(--secondary-container))",
        "secondary-fixed": "hsl(var(--secondary-fixed))",
        "secondary-fixed-dim": "hsl(var(--secondary-fixed-dim))",
        "on-secondary-fixed": "hsl(var(--on-secondary-fixed))",
        "on-secondary-fixed-variant": "hsl(var(--on-secondary-fixed-variant))",
        "on-secondary-container": "hsl(var(--on-secondary-container))",
        "primary-fixed": "hsl(var(--primary-fixed))",
        "primary-fixed-dim": "hsl(var(--primary-fixed-dim))",
        "on-primary-fixed": "hsl(var(--on-primary-fixed))",
        "on-primary-fixed-variant": "hsl(var(--on-primary-fixed-variant))",
        "outline": "hsl(var(--outline))",
        "outline-variant": "hsl(var(--outline-variant))",
        // LINE Official Account green
        "line-green": {
          DEFAULT: "hsl(var(--color-line-green))",
          light: "hsl(var(--color-line-green-light))",
          dark: "hsl(var(--color-line-green-dark))",
        },
        sidebar: {
          bg: "hsl(var(--sidebar-bg))",
          active: "hsl(var(--sidebar-active))",
          divider: "hsl(var(--sidebar-divider))",
          text: "hsl(var(--sidebar-text))",
          "text-active": "hsl(var(--sidebar-text-active))",
        },
        // Design-system color tokens
        "color-bg":           "hsl(var(--color-bg))",
        "color-surface":      "hsl(var(--color-surface))",
        "color-border":       "hsl(var(--color-border))",
        "color-border-strong":"hsl(var(--color-border-strong))",
        "color-text":         "hsl(var(--color-text))",
        "color-text-2":       "hsl(var(--color-text-2))",
        "color-text-3":       "hsl(var(--color-text-3))",
        "color-primary":      "hsl(var(--color-primary))",
        "color-danger":       "hsl(var(--color-danger))",
        "color-success":      "hsl(var(--color-success))",
        "color-warning":      "hsl(var(--color-warning))",
        // Extended semantic tokens
        "success-container":       "hsl(var(--success-container))",
        "on-success-container":    "hsl(var(--on-success-container))",
        "warning-container":       "hsl(var(--warning-container))",
        "on-warning-container":    "hsl(var(--on-warning-container))",
        "info-container":          "hsl(var(--info-container))",
        "on-info-container":       "hsl(var(--on-info-container))",
        // Navy + amber palette (replaces sage)
        navy: {
          50:  "hsl(217 40% 92%)",
          100: "hsl(217 35% 85%)",
          200: "hsl(217 30% 75%)",
          300: "hsl(217 25% 65%)",
          400: "hsl(217 55% 40%)",
          500: "hsl(217 55% 30%)",
          600: "hsl(217 55% 24%)",
          700: "hsl(217 55% 18%)",
          800: "hsl(217 45% 12%)",
          900: "hsl(217 40% 8%)",
        },
        amber: {
          400: "hsl(38 92% 55%)",
          500: "hsl(38 85% 50%)",
        },
      },
      boxShadow: {
        "app-md": "var(--shadow-md)",
        "app-lg": "var(--shadow-lg)",
        "app-sm": "var(--shadow-sm)",
        "app-card": "var(--shadow-card)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
