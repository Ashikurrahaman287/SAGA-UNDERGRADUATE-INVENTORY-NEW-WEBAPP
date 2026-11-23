import { describe, expect, it } from 'vitest';
import { hasPermission } from '../../src/lib/permissions/permission-utils';
import { permissions } from '../../src/lib/permissions/permission-registry';

describe('supplier and seller authorization', () => {
  it('keeps both business-record modules Admin-only', () => {
    expect(hasPermission('admin', permissions.suppliersView)).toBe(true);
    expect(hasPermission('admin', permissions.suppliersManage)).toBe(true);
    expect(hasPermission('admin', permissions.sellersView)).toBe(true);
    expect(hasPermission('admin', permissions.sellersManage)).toBe(true);
    expect(hasPermission('moderator', permissions.suppliersView)).toBe(false);
    expect(hasPermission('moderator', permissions.sellersView)).toBe(false);
    expect(hasPermission('rider', permissions.suppliersView)).toBe(false);
    expect(hasPermission('rider', permissions.sellersView)).toBe(false);
  });
});
