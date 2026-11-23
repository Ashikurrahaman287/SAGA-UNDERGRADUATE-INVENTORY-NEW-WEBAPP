import { describe, expect, it } from 'vitest';
import { productFormSchema } from '../../src/features/products/product-validation';
import { hasPermission } from '../../src/lib/permissions/permission-utils';
import { permissions } from '../../src/lib/permissions/permission-registry';

describe('product validation and permissions', () => {
  it('normalizes SKU and requires an opening-stock reason', () => {
    const result = productFormSchema.safeParse({
      name: 'Widget',
      sku: ' w-1 ',
      costPrice: '2.50',
      sellingPrice: '4.00',
      initialStock: '5',
    });
    expect(result.success).toBe(false);
    const valid = productFormSchema.parse({
      name: 'Widget',
      sku: ' w-1 ',
      costPrice: '2.50',
      sellingPrice: '4.00',
      initialStock: '5',
      openingStockReason: 'Opening count',
    });
    expect(valid.sku).toBe('W-1');
  });

  it('rejects negative values and protects category management', () => {
    expect(
      productFormSchema.safeParse({ name: 'Widget', sku: 'W-1', costPrice: -1, sellingPrice: 4 })
        .success,
    ).toBe(false);
    expect(hasPermission('admin', permissions.categoriesManage)).toBe(true);
    expect(hasPermission('moderator', permissions.categoriesManage)).toBe(false);
    expect(hasPermission('rider', permissions.productsView)).toBe(false);
  });
});
