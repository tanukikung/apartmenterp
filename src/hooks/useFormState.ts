import { useState, useCallback, useRef } from 'react';
import { ZodSchema } from 'zod';

export interface FormStateOptions<T> {
  initialValues: T;
  onSubmit?: (values: T) => Promise<void> | void;
  validate?: (values: T) => Record<string, string>;
  schema?: ZodSchema;
}

export interface FormState<T> {
  values: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  isDirty: boolean;
  isSubmitting: boolean;
  isValid: boolean;
}

export interface FormActions<T> {
  setValue<K extends keyof T>(field: K, value: T[K]): void;
  setValues(values: Partial<T>): void;
  setError(field: string, error: string): void;
  setTouched(field: string, touched: boolean): void;
  submit(): Promise<void>;
  reset(): void;
  getFieldProps(field: keyof T): {
    name: string;
    value: T[keyof T];
    onChange: (e: { target: { value: any } }) => void;
    onBlur: () => void;
  };
}

export function useFormState<T extends Record<string, any>>(
  options: FormStateOptions<T>
): FormState<T> & FormActions<T> {
  const initialValuesRef = useRef(options.initialValues);
  const [values, setValues] = useState<T>(options.initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValuesRef.current);

  const validateValues = useCallback(
    (vals: T): Record<string, string> => {
      let newErrors: Record<string, string> = {};

      if (options.schema) {
        const result = options.schema.safeParse(vals);
        if (!result.success) {
          result.error.errors.forEach((err) => {
            const path = err.path.join('.');
            newErrors[path] = err.message;
          });
        }
      } else if (options.validate) {
        newErrors = options.validate(vals);
      }

      return newErrors;
    },
    [options]
  );

  const isValid = Object.keys(errors).length === 0;

  const handleSetValue = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setValues((prev) => {
        const updated = { ...prev, [field]: value };
        const newErrors = validateValues(updated);
        setErrors(newErrors);
        return updated;
      });
    },
    [validateValues]
  );

  const handleSetValues = useCallback(
    (newVals: Partial<T>) => {
      setValues((prev) => {
        const updated = { ...prev, ...newVals };
        const newErrors = validateValues(updated);
        setErrors(newErrors);
        return updated;
      });
    },
    [validateValues]
  );

  const handleSetError = useCallback((field: string, error: string) => {
    setErrors((prev) => ({
      ...prev,
      [field]: error,
    }));
  }, []);

  const handleSetTouched = useCallback((field: string, isTouched: boolean) => {
    setTouched((prev) => ({
      ...prev,
      [field]: isTouched,
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const newErrors = validateValues(values);
    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      setIsSubmitting(true);
      try {
        if (options.onSubmit) {
          await options.onSubmit(values);
        }
        initialValuesRef.current = values;
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [validateValues, values, options]);

  const handleReset = useCallback(() => {
    setValues(initialValuesRef.current);
    setErrors({});
    setTouched({});
  }, []);

  const getFieldProps = useCallback(
    (field: keyof T) => ({
      name: String(field),
      value: values[field],
      onChange: (e: { target: { value: any } }) => {
        handleSetValue(field, e.target.value);
      },
      onBlur: () => {
        handleSetTouched(String(field), true);
      },
    }),
    [values, handleSetValue, handleSetTouched]
  );

  return {
    values,
    errors,
    touched,
    isDirty,
    isSubmitting,
    isValid,
    setValue: handleSetValue,
    setValues: handleSetValues,
    setError: handleSetError,
    setTouched: handleSetTouched,
    submit: handleSubmit,
    reset: handleReset,
    getFieldProps,
  };
}
