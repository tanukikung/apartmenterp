import { theme } from './theme';

type ColorPath =
  | 'primary.50' | 'primary.100' | 'primary.200' | 'primary.300' | 'primary.400' | 'primary.500' | 'primary.600' | 'primary.700' | 'primary.800' | 'primary.900'
  | 'secondary.50' | 'secondary.100' | 'secondary.200' | 'secondary.300' | 'secondary.400' | 'secondary.500' | 'secondary.600' | 'secondary.700' | 'secondary.800' | 'secondary.900'
  | 'neutral.0' | 'neutral.50' | 'neutral.100' | 'neutral.200' | 'neutral.300' | 'neutral.400' | 'neutral.500' | 'neutral.600' | 'neutral.700' | 'neutral.800' | 'neutral.900' | 'neutral.950'
  | 'success.light' | 'success.main' | 'success.dark'
  | 'warning.light' | 'warning.main' | 'warning.dark'
  | 'error.light' | 'error.main' | 'error.dark'
  | 'info.light' | 'info.main' | 'info.dark'
  | 'text.primary' | 'text.secondary' | 'text.tertiary' | 'text.disabled' | 'text.inverse'
  | 'background.primary' | 'background.secondary' | 'background.tertiary' | 'background.disabled'
  | 'border.light' | 'border.main' | 'border.dark'
  | 'interactive.hover' | 'interactive.active' | 'interactive.focus' | 'interactive.disabled';

export function getColor(path: ColorPath): string {
  const parts = path.split('.');
  let current: any = theme.colors;

  for (const part of parts) {
    current = current?.[part];
  }

  return current || '';
}

export const themeColors = {
  // Primary colors
  primaryLight: getColor('primary.100'),
  primaryMain: getColor('primary.500'),
  primaryDark: getColor('primary.700'),

  // Secondary colors
  secondaryLight: getColor('secondary.100'),
  secondaryMain: getColor('secondary.500'),
  secondaryDark: getColor('secondary.700'),

  // Text colors
  textPrimary: getColor('text.primary'),
  textSecondary: getColor('text.secondary'),
  textTertiary: getColor('text.tertiary'),
  textDisabled: getColor('text.disabled'),

  // Background colors
  bgPrimary: getColor('background.primary'),
  bgSecondary: getColor('background.secondary'),
  bgTertiary: getColor('background.tertiary'),

  // Border colors
  borderLight: getColor('border.light'),
  borderMain: getColor('border.main'),
  borderDark: getColor('border.dark'),

  // Status colors
  success: getColor('success.main'),
  warning: getColor('warning.main'),
  error: getColor('error.main'),
  info: getColor('info.main'),
};

export function rgbaColor(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
