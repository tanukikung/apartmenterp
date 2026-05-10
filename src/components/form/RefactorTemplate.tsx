'use client';

import { useFormState } from '@/hooks/useFormState';
import { useTheme } from '@/hooks/useTheme';
import { z } from 'zod';

// Form schema
const exampleFormSchema = z.object({
  name: z.string().min(1, 'ชื่อเป็นช่องบังคับ'),
  email: z.string().email('อีเมลไม่ถูกต้อง'),
  description: z.string().optional(),
});

type ExampleFormValues = z.infer<typeof exampleFormSchema>;

interface RefactorTemplateProps {
  onSubmit?: (values: ExampleFormValues) => Promise<void>;
  initialValues?: Partial<ExampleFormValues>;
}

export function RefactorTemplate({ onSubmit, initialValues }: RefactorTemplateProps) {
  const t = useTheme();
  const form = useFormState<ExampleFormValues>({
    initialValues: {
      name: initialValues?.name ?? '',
      email: initialValues?.email ?? '',
      description: initialValues?.description ?? '',
    },
    schema: exampleFormSchema,
    onSubmit: async (values) => {
      if (onSubmit) {
        await onSubmit(values);
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.submit();
      }}
      className="space-y-6 rounded-lg border p-6"
      style={{
        backgroundColor: t.colors.background.primary,
        borderColor: t.colors.border.light,
      }}
    >
      {/* Form Header */}
      <div>
        <h2
          className="text-lg font-semibold"
          style={{ color: t.colors.text.primary }}
        >
          ข้อมูลตัวอย่าง
        </h2>
        <p
          className="mt-1 text-sm"
          style={{ color: t.colors.text.secondary }}
        >
          กรอกข้อมูลที่จำเป็น
        </p>
      </div>

      {/* Name Field */}
      <div className="space-y-2">
        <label
          htmlFor="name"
          className="block text-sm font-medium"
          style={{ color: t.colors.text.primary }}
        >
          ชื่อ *
        </label>
        <input
          id="name"
          type="text"
          placeholder="กรอกชื่อ"
          {...form.getFieldProps('name')}
          className="w-full rounded-md border px-3 py-2 text-sm transition-colors"
          style={{
            backgroundColor: t.colors.background.primary,
            borderColor: form.errors.name ? t.colors.error.main : t.colors.border.light,
            color: t.colors.text.primary,
          }}
          onBlur={() => {
            form.setTouched('name', true);
            form.getFieldProps('name').onBlur?.();
          }}
        />
        {form.touched.name && form.errors.name && (
          <p className="text-xs" style={{ color: t.colors.error.main }}>
            {form.errors.name}
          </p>
        )}
      </div>

      {/* Email Field */}
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium"
          style={{ color: t.colors.text.primary }}
        >
          อีเมล *
        </label>
        <input
          id="email"
          type="email"
          placeholder="user@example.com"
          {...form.getFieldProps('email')}
          className="w-full rounded-md border px-3 py-2 text-sm transition-colors"
          style={{
            backgroundColor: t.colors.background.primary,
            borderColor: form.errors.email ? t.colors.error.main : t.colors.border.light,
            color: t.colors.text.primary,
          }}
          onBlur={() => {
            form.setTouched('email', true);
            form.getFieldProps('email').onBlur?.();
          }}
        />
        {form.touched.email && form.errors.email && (
          <p className="text-xs" style={{ color: t.colors.error.main }}>
            {form.errors.email}
          </p>
        )}
      </div>

      {/* Description Field */}
      <div className="space-y-2">
        <label
          htmlFor="description"
          className="block text-sm font-medium"
          style={{ color: t.colors.text.primary }}
        >
          หมายเหตุ
        </label>
        <textarea
          id="description"
          placeholder="กรอกหมายเหตุ (ไม่จำเป็น)"
          {...form.getFieldProps('description')}
          rows={4}
          className="w-full rounded-md border px-3 py-2 text-sm transition-colors"
          style={{
            backgroundColor: t.colors.background.primary,
            borderColor: t.colors.border.light,
            color: t.colors.text.primary,
          }}
        />
      </div>

      {/* Form Actions */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={form.isSubmitting || !form.isValid}
          className="flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            backgroundColor: form.isValid ? t.colors.primary[500] : t.colors.neutral[300],
            color: t.colors.text.inverse,
          }}
        >
          {form.isSubmitting ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <button
          type="button"
          onClick={form.reset}
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors"
          style={{
            borderColor: t.colors.border.light,
            color: t.colors.text.primary,
          }}
        >
          ยกเลิก
        </button>
      </div>

      {/* Dirty state indicator */}
      {form.isDirty && (
        <p className="text-xs" style={{ color: t.colors.warning.main }}>
          มีการแก้ไข ยังไม่ได้บันทึก
        </p>
      )}
    </form>
  );
}
