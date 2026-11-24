import { describe, expect, it } from 'vitest';
import { hasPermission } from '../../src/lib/permissions/permission-utils';
import { permissions } from '../../src/lib/permissions/permission-registry';

describe('fulfillment role boundaries', () => {
  it('allows staff packaging and delivery operations', () => {
    expect(hasPermission('admin', permissions.packagingUpdate)).toBe(true);
    expect(hasPermission('moderator', permissions.packagingUpdate)).toBe(true);
    expect(hasPermission('admin', permissions.deliveryAssign)).toBe(true);
  });

  it('allows Riders only assigned delivery update and payment collection permissions', () => {
    expect(hasPermission('rider', permissions.deliveryView)).toBe(true);
    expect(hasPermission('rider', permissions.deliveryUpdate)).toBe(true);
    expect(hasPermission('rider', permissions.paymentsCollect)).toBe(true);
    expect(hasPermission('rider', permissions.deliveryAssign)).toBe(false);
    expect(hasPermission('rider', permissions.salesView)).toBe(false);
  });
});
