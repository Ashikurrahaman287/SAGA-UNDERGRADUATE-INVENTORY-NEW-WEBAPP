import { describe, expect, it } from 'vitest';
import { hasPermission } from '../../src/lib/permissions/permission-utils';
import { permissions } from '../../src/lib/permissions/permission-registry';
import { getDeliveryTab, isPackagingWorkflowActive, localDateTimeToUtcIso } from '../../src/features/fulfillment/delivery-date';

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

describe('fulfillment queue state and business dates', () => {
  it('excludes completed, cancelled, and dispatched work from Packaging even when packaging status is stale', () => {
    expect(isPackagingWorkflowActive('packed', [])).toBe(true);
    expect(isPackagingWorkflowActive('delivered', [])).toBe(false);
    expect(isPackagingWorkflowActive('cancelled', [])).toBe(false);
    expect(isPackagingWorkflowActive('out_for_delivery', [])).toBe(false);
    expect(isPackagingWorkflowActive('packed', [{ status: 'delivered' }])).toBe(false);
    expect(isPackagingWorkflowActive('packed', [{ status: 'assigned' }])).toBe(false);
    expect(isPackagingWorkflowActive('processing', [{ status: 'unassigned', delivered_at: '2026-11-26T04:00:00Z' }])).toBe(false);
  });

  it('groups scheduled deliveries by calendar date in the organization timezone', () => {
    const now = new Date('2026-11-25T18:30:00.000Z');
    expect(getDeliveryTab('2026-11-26T17:59:00.000Z', now, 'Asia/Dhaka')).toBe('today');
    expect(getDeliveryTab('2026-11-26T18:00:00.000Z', now, 'Asia/Dhaka')).toBe('tomorrow');
    expect(getDeliveryTab('2026-11-27T18:00:00.000Z', now, 'Asia/Dhaka')).toBe('upcoming');
    expect(getDeliveryTab(null, now, 'Asia/Dhaka')).toBe('upcoming');
  });

  it('converts a business-local reschedule date without applying the browser timezone', () => {
    expect(localDateTimeToUtcIso('2026-11-26', '00:30', 'Asia/Dhaka')).toBe('2026-11-25T18:30:00.000Z');
  });

  it('rejects nonexistent local times during daylight-saving transitions', () => {
    expect(() => localDateTimeToUtcIso('2026-03-08', '02:30', 'America/Los_Angeles')).toThrow('does not exist');
  });
});
