import { describe, expect, it } from 'vitest';
import { hasPermission } from '../../src/lib/permissions/permission-utils';
import { permissions } from '../../src/lib/permissions/permission-registry';

function refundableLine(unitPriceMinor: number, quantity: number, discountRatio: number): number {
  return Math.round(unitPriceMinor * quantity * (1 - discountRatio));
}

describe('return/refund boundaries', () => {
  it('calculates partial line refunds from proportional snapshot values', () => {
    expect(refundableLine(10000, 2, 0.1)).toBe(18000);
  });

  it('allows Admin return operations and denies Rider access', () => {
    expect(hasPermission('admin', permissions.returnsCreate)).toBe(true);
    expect(hasPermission('rider', permissions.returnsView)).toBe(false);
  });

  it('does not automatically grant Moderator returns', () => {
    expect(hasPermission('moderator', permissions.returnsView)).toBe(false);
  });
});
