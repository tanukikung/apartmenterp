export const theme = {
  colors: {
    // Primary palette (Premium Ivory + Bronze)
    primary: {
      50: '#faf8f3',
      100: '#f5f1e8',
      200: '#e8dfd0',
      300: '#dcc8b3',
      400: '#c9ab8e',
      500: '#a08668', // Primary
      600: '#876952',
      700: '#6f563f',
      800: '#57442f',
      900: '#423520',
    },

    // Secondary palette (Warm Bronze)
    secondary: {
      50: '#fef9f4',
      100: '#fdf3e8',
      200: '#fae0cc',
      300: '#f5c7a3',
      400: '#eda76f',
      500: '#d4874a', // Secondary
      600: '#ba6d3b',
      700: '#975730',
      800: '#794429',
      900: '#633820',
    },

    // Neutral palette
    neutral: {
      0: '#ffffff',
      50: '#f9f7f5',
      100: '#f3f1ed',
      200: '#e8e5e0',
      300: '#d9d5ce',
      400: '#c1bbb2',
      500: '#a5a09a',
      600: '#888279',
      700: '#6f6a62',
      800: '#544f48',
      900: '#3a3530',
      950: '#1f1b17',
    },

    // Status colors
    success: {
      light: '#d1fae5',
      main: '#10b981',
      dark: '#059669',
    },
    warning: {
      light: '#fef3c7',
      main: '#f59e0b',
      dark: '#d97706',
    },
    error: {
      light: '#fee2e2',
      main: '#ef4444',
      dark: '#dc2626',
    },
    info: {
      light: '#dbeafe',
      main: '#3b82f6',
      dark: '#1d4ed8',
    },

    // Semantic colors
    text: {
      primary: '#3a3530', // neutral.900
      secondary: '#6f6a62', // neutral.700
      tertiary: '#a5a09a', // neutral.500
      disabled: '#c1bbb2', // neutral.400
      inverse: '#ffffff', // neutral.0
    },

    background: {
      primary: '#ffffff', // neutral.0
      secondary: '#f9f7f5', // neutral.50
      tertiary: '#f3f1ed', // neutral.100
      disabled: '#e8e5e0', // neutral.200
    },

    border: {
      light: '#d9d5ce', // neutral.300
      main: '#c1bbb2', // neutral.400
      dark: '#a5a09a', // neutral.500
    },

    // Interactive colors
    interactive: {
      hover: '#876952', // primary.600
      active: '#6f563f', // primary.700
      focus: '#a08668', // primary.500 with opacity
      disabled: '#c1bbb2', // neutral.400
    },
  },

  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '2.5rem',
    '3xl': '3rem',
  },

  borderRadius: {
    none: '0',
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '1rem',
    full: '9999px',
  },

  shadows: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },

  typography: {
    fontFamily: {
      sans: 'system-ui, -apple-system, sans-serif',
      mono: 'ui-monospace, monospace',
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
    },
    fontWeight: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },

  // Z-index stack
  zIndex: {
    hide: '-1',
    auto: '0',
    base: '1',
    dropdown: '1000',
    sticky: '1020',
    fixed: '1030',
    modalBackdrop: '1040',
    modal: '1050',
    popover: '1060',
    tooltip: '1070',
  },

  // Transition durations
  transitions: {
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
    slower: '500ms',
  },
};

export type Theme = typeof theme;
export type ThemeColor = keyof typeof theme.colors;
export type ThemeSpacing = keyof typeof theme.spacing;
