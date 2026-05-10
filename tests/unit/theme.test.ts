/**
 * Unit tests for theme system (Phase 2)
 */

import { describe, it, expect } from 'vitest';
import { theme } from '@/lib/theme';
import { themeColors, getColor, rgbaColor } from '@/lib/theme-utils';

describe('Theme System', () => {
  describe('theme colors', () => {
    it('should have primary color palette', () => {
      expect(theme.colors.primary).toBeDefined();
      expect(theme.colors.primary[500]).toBe('#a08668');
    });

    it('should have semantic colors', () => {
      expect(theme.colors.text.primary).toBeDefined();
      expect(theme.colors.background.primary).toBe('#ffffff');
      expect(theme.colors.border.light).toBeDefined();
    });

    it('should have status colors', () => {
      expect(theme.colors.success.main).toBe('#10b981');
      expect(theme.colors.error.main).toBe('#ef4444');
      expect(theme.colors.warning.main).toBe('#f59e0b');
    });
  });

  describe('spacing system', () => {
    it('should define standard spacing values', () => {
      expect(theme.spacing.xs).toBe('0.25rem');
      expect(theme.spacing.md).toBe('1rem');
      expect(theme.spacing.xl).toBe('2rem');
    });

    it('should have consistent spacing scale', () => {
      const spacings = Object.values(theme.spacing);
      expect(spacings.length).toBeGreaterThan(0);
    });
  });

  describe('typography', () => {
    it('should define font families', () => {
      expect(theme.typography.fontFamily.sans).toBeDefined();
      expect(theme.typography.fontFamily.mono).toBeDefined();
    });

    it('should define font sizes', () => {
      expect(theme.typography.fontSize.base).toBe('1rem');
      expect(theme.typography.fontSize.sm).toBe('0.875rem');
    });

    it('should define font weights', () => {
      expect(theme.typography.fontWeight.normal).toBe(400);
      expect(theme.typography.fontWeight.bold).toBe(700);
    });
  });

  describe('color utilities', () => {
    it('should get color by path', () => {
      const color = getColor('primary.500');
      expect(color).toBe('#a08668');
    });

    it('should convert hex to rgba', () => {
      const rgba = rgbaColor('#000000', 0.5);
      expect(rgba).toBe('rgba(0, 0, 0, 0.5)');
    });

    it('should provide theme color constants', () => {
      expect(themeColors.primaryMain).toBe('#a08668');
      expect(themeColors.bgPrimary).toBe('#ffffff');
      expect(themeColors.success).toBe('#10b981');
    });
  });

  describe('z-index stack', () => {
    it('should define z-index values in order', () => {
      expect(theme.zIndex.modal).toBeGreaterThan(theme.zIndex.dropdown);
      expect(theme.zIndex.tooltip).toBeGreaterThan(theme.zIndex.popover);
    });
  });

  describe('transitions', () => {
    it('should define transition durations', () => {
      expect(theme.transitions.fast).toBe('150ms');
      expect(theme.transitions.slow).toBe('300ms');
    });
  });
});
