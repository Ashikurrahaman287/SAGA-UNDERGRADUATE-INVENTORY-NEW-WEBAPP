import { describe, expect, it } from 'vitest';
import { hasPermission } from '../../src/lib/permissions/permission-utils';
import { permissions } from '../../src/lib/permissions/permission-registry';

describe('sales history authorization', () => {
  it('allows Admin and Moderator to view sales history', () => {
    expect(hasPermission('admin', permissions.salesView)).toBe(true);
    expect(hasPermission('moderator', permissions.salesView)).toBe(true);
  });

  it('denies Rider access to general sales history', () => {
    expect(hasPermission('rider', permissions.salesView)).toBe(false);
  });

  it('does not grant seller administration through sales view', () => {
    expect(hasPermission('moderator', permissions.sellersManage)).toBe(false);
  });
});
