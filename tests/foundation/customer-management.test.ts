import { describe, expect, it } from 'vitest';
import { customerSchema } from '../../src/features/customers/customer-validation';
import { hasPermission } from '../../src/lib/permissions/permission-utils';
import { permissions } from '../../src/lib/permissions/permission-registry';

describe('customer management boundaries', () => {
  it('requires and validates a phone while allowing optional email', () => {
    expect(customerSchema.safeParse({ name: 'Customer', phone: '123' }).success).toBe(false);
    expect(customerSchema.safeParse({ name: 'Customer', phone: '+233 20 123 4567' }).success).toBe(
      true,
    );
    expect(
      customerSchema.safeParse({ name: 'Customer', phone: '+233 20 123 4567', email: 'bad' })
        .success,
    ).toBe(false);
  });

  it('keeps customer management unavailable to Riders and communications admin-only', () => {
    expect(hasPermission('admin', permissions.customersView)).toBe(true);
    expect(hasPermission('moderator', permissions.customersCreate)).toBe(true);
    expect(hasPermission('rider', permissions.customersView)).toBe(false);
    expect(hasPermission('moderator', permissions.communicationsManage)).toBe(false);
  });
});
