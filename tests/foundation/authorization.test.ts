import { describe, expect, it } from 'vitest';
import { getAuthorizedNavigation } from '../../src/lib/permissions/navigation';
import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from '../../src/lib/permissions/permission-utils';
import { permissions } from '../../src/lib/permissions/permission-registry';

describe('authorization matrix', () => {
  it('grants Admin all registered permissions', () => {
    expect(hasPermission('admin', permissions.accountingManage)).toBe(true);
    expect(hasPermission('admin', permissions.usersDeactivate)).toBe(true);
  });

  it('limits Moderator to operational modules', () => {
    expect(hasPermission('moderator', permissions.dashboardView)).toBe(false);
    expect(
      hasAllPermissions('moderator', [
        permissions.productsUpdate,
        permissions.salesCreate,
        permissions.deliveryUpdate,
      ]),
    ).toBe(true);
    expect(
      hasAnyPermission('moderator', [
        permissions.reportsView,
        permissions.accountingView,
        permissions.usersUpdate,
      ]),
    ).toBe(false);
    expect(hasPermission('moderator', permissions.returnsApprove)).toBe(false);
  });

  it('limits Rider to assigned delivery operations', () => {
    expect(hasPermission('rider', permissions.dashboardView)).toBe(false);
    expect(
      hasAllPermissions('rider', [
        permissions.deliveryView,
        permissions.deliveryUpdate,
        permissions.deliveryComplete,
      ]),
    ).toBe(true);
    expect(
      hasAnyPermission('rider', [
        permissions.productsView,
        permissions.salesView,
        permissions.customersView,
        permissions.auditLogsView,
      ]),
    ).toBe(false);
  });

  it('filters navigation by verified role permissions', () => {
    const labels = (role: 'admin' | 'moderator' | 'rider') =>
      getAuthorizedNavigation(role).flatMap((group) => group.items.map((item) => item.label));
    expect(labels('admin')).toContain('Dashboard');
    expect(labels('admin')).toContain('User Management');
    expect(labels('moderator')).toEqual([
      'Products',
      'Categories',
      'Stock Management',
      'Customers',
      'New Sale',
      'Sales History',
      'Packaging',
      'Delivery',
    ]);
    expect(labels('rider')).toEqual(['Delivery']);
  });
});
