import { describe, expect, it } from 'vitest';
import { DocumentTemplateType } from '@prisma/client';
import {
  createRepeatBlockMarkup,
  createScalarFieldMarkup,
  getTemplateFieldCatalog,
  getTemplateFieldCatalogByCategory,
} from '@/modules/documents/field-catalog';

describe('document field catalog', () => {
  it('returns billing fields for invoice templates', () => {
    const fields = getTemplateFieldCatalog(DocumentTemplateType.INVOICE);
    expect(fields.some((field) => field.key === 'billing.total')).toBe(true);
    expect(fields.some((field) => field.key === 'billing_items')).toBe(true);
  });

  it('excludes billing collections from general notices', () => {
    const fields = getTemplateFieldCatalog(DocumentTemplateType.GENERAL_NOTICE);
    expect(fields.some((field) => field.key === 'billing_items')).toBe(false);
    expect(fields.some((field) => field.key === 'room.number')).toBe(true);
  });

  it('groups fields by category', () => {
    const grouped = getTemplateFieldCatalogByCategory(DocumentTemplateType.INVOICE);
    expect(grouped.room?.length).toBeGreaterThan(0);
    expect(grouped.billing?.length).toBeGreaterThan(0);
  });

  it('creates structured markup for scalar and repeat fields', () => {
    expect(createScalarFieldMarkup('room.number', 'Room Number')).toContain('data-template-field="room.number"');
    expect(createRepeatBlockMarkup('billing_items')).toContain('data-template-repeat="billing_items"');
  });
});
