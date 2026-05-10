/**
 * Unit tests for useFormState hook (Phase 2)
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormState } from '@/hooks/useFormState';
import { z } from 'zod';

describe('useFormState Hook', () => {
  const schema = z.object({
    email: z.string().email('Invalid email'),
    name: z.string().min(2, 'Name too short'),
  });

  type FormValues = z.infer<typeof schema>;

  const defaultValues: FormValues = {
    email: '',
    name: '',
  };

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues })
      );

      expect(result.current.values.email).toBe('');
      expect(result.current.values.name).toBe('');
    });

    it('should set isDirty to false initially', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues })
      );

      expect(result.current.isDirty).toBe(false);
    });

    it('should have empty errors initially', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues })
      );

      expect(Object.keys(result.current.errors).length).toBe(0);
    });
  });

  describe('field manipulation', () => {
    it('should update single field value', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues })
      );

      act(() => {
        result.current.setValue('email', 'test@example.com');
      });

      expect(result.current.values.email).toBe('test@example.com');
    });

    it('should update multiple fields', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues })
      );

      act(() => {
        result.current.setValues({
          email: 'test@example.com',
          name: 'John',
        });
      });

      expect(result.current.values.email).toBe('test@example.com');
      expect(result.current.values.name).toBe('John');
    });

    it('should mark field as touched', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues })
      );

      act(() => {
        result.current.setTouched('email', true);
      });

      expect(result.current.touched.email).toBe(true);
    });
  });

  describe('validation', () => {
    it('should validate on change', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues, schema })
      );

      act(() => {
        result.current.setValue('email', 'invalid');
      });

      expect(result.current.errors.email).toBeDefined();
    });

    it('should clear errors on valid input', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues, schema })
      );

      act(() => {
        result.current.setValue('email', 'invalid');
      });

      expect(result.current.errors.email).toBeDefined();

      act(() => {
        result.current.setValue('email', 'test@example.com');
      });

      expect(result.current.errors.email).toBeUndefined();
    });

    it('should validate all fields', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues, schema })
      );

      expect(result.current.isValid).toBe(false);

      act(() => {
        result.current.setValues({
          email: 'test@example.com',
          name: 'John',
        });
      });

      expect(result.current.isValid).toBe(true);
    });
  });

  describe('form submission', () => {
    it('should call onSubmit with valid data', async () => {
      const onSubmit = vi.fn();
      const { result } = renderHook(() =>
        useFormState({
          initialValues: defaultValues,
          schema,
          onSubmit,
        })
      );

      act(() => {
        result.current.setValues({
          email: 'test@example.com',
          name: 'John',
        });
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'John',
      });
    });

    it('should not submit with validation errors', async () => {
      const onSubmit = vi.fn();
      const { result } = renderHook(() =>
        useFormState({
          initialValues: defaultValues,
          schema,
          onSubmit,
        })
      );

      await act(async () => {
        await result.current.submit();
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should set isSubmitting during submission', async () => {
      const onSubmit = vi.fn(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      const { result } = renderHook(() =>
        useFormState({
          initialValues: {
            email: 'test@example.com',
            name: 'John',
          },
          onSubmit,
        })
      );

      await act(async () => {
        const submitPromise = result.current.submit();
        expect(result.current.isSubmitting).toBe(true);
        await submitPromise;
      });

      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe('form reset', () => {
    it('should reset to initial values', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues })
      );

      act(() => {
        result.current.setValues({
          email: 'test@example.com',
          name: 'John',
        });
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.values.email).toBe('');
      expect(result.current.values.name).toBe('');
    });

    it('should clear errors on reset', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues, schema })
      );

      act(() => {
        result.current.setError('email', 'Custom error');
      });

      expect(result.current.errors.email).toBeDefined();

      act(() => {
        result.current.reset();
      });

      expect(Object.keys(result.current.errors).length).toBe(0);
    });

    it('should clear touched state on reset', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues })
      );

      act(() => {
        result.current.setTouched('email', true);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.touched.email).toBeUndefined();
    });
  });

  describe('getFieldProps', () => {
    it('should return field props object', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues })
      );

      const props = result.current.getFieldProps('email');

      expect(props.name).toBe('email');
      expect(props.value).toBe('');
      expect(typeof props.onChange).toBe('function');
      expect(typeof props.onBlur).toBe('function');
    });

    it('should handle onChange event', () => {
      const { result } = renderHook(() =>
        useFormState({ initialValues: defaultValues })
      );

      const props = result.current.getFieldProps('email');

      act(() => {
        props.onChange({ target: { value: 'test@example.com' } });
      });

      expect(result.current.values.email).toBe('test@example.com');
    });
  });

  describe('dirty tracking', () => {
    it('should track dirty state', () => {
      const { result } = renderHook(() =>
        useFormState({
          initialValues: { email: 'initial@example.com', name: 'John' },
        })
      );

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.setValue('email', 'new@example.com');
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should clear dirty state on reset', () => {
      const { result } = renderHook(() =>
        useFormState({
          initialValues: { email: 'initial@example.com', name: 'John' },
        })
      );

      act(() => {
        result.current.setValue('email', 'new@example.com');
      });

      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.isDirty).toBe(false);
    });
  });
});
