import { describe, expect, it } from 'vitest';
import { hasPermission } from '../../src/lib/permissions/permission-utils';
import { permissions } from '../../src/lib/permissions/permission-registry';
import { organizationSettingsSchema } from '../../src/features/settings/settings-validation';
import { sanitizeAuditValue } from '../../src/features/settings/audit-safety';
import {
  memberInviteSchema,
  membershipChangeIssue,
} from '../../src/features/settings/member-validation';

const validSettings = {
  name: 'SAGA Inventory',
  businessEmail: 'ops@example.com',
  businessPhone: '+8801700000000',
  businessAddress: 'Dhaka',
  currency: 'BDT',
  timezone: 'Asia/Dhaka',
  lowStockThreshold: 5,
  receiptPrefix: 'SAGA',
  receiptHeader: '',
  receiptFooter: 'Thank you',
  receiptNotes: '',
  notificationPreferences: { lowStock: true, sales: false, deliveries: true, returns: false },
  moderatorReturnsEnabled: false,
};

describe('settings administration validation and boundaries', () => {
  it('accepts valid organization settings and rejects invalid IANA timezones', () => {
    expect(organizationSettingsSchema.safeParse(validSettings).success).toBe(true);
    expect(
      organizationSettingsSchema.safeParse({
        ...validSettings,
        receiptFooter: 'Thanks\nCome again',
      }).success,
    ).toBe(true);
    expect(organizationSettingsSchema.safeParse({ ...validSettings, name: ' ' }).success).toBe(
      false,
    );
    expect(
      organizationSettingsSchema.safeParse({ ...validSettings, receiptPrefix: 'SAGA/2026' })
        .success,
    ).toBe(false);
    expect(
      organizationSettingsSchema.safeParse({ ...validSettings, timezone: 'Not/A_Timezone' })
        .success,
    ).toBe(false);
  });

  it('rejects negative thresholds and invalid currency codes', () => {
    expect(
      organizationSettingsSchema.safeParse({ ...validSettings, lowStockThreshold: -1 }).success,
    ).toBe(false);
    expect(
      organizationSettingsSchema.safeParse({ ...validSettings, currency: 'ZZZ' }).success,
    ).toBe(false);
  });

  it('strips secret-valued unknown settings rather than treating them as editable fields', () => {
    const parsed = organizationSettingsSchema.parse({
      ...validSettings,
      SWIFTSMS_API_KEY: 'never-persist-this',
      EMAIL_API_KEY: 'never-persist-this-either',
    });
    expect(parsed).not.toHaveProperty('SWIFTSMS_API_KEY');
    expect(parsed).not.toHaveProperty('EMAIL_API_KEY');
  });

  it('redacts sensitive values recursively in audit snapshots', () => {
    expect(
      sanitizeAuditValue({
        name: 'Admin',
        credentials: [{ access_token: 'secret', apiKey: 'secret' }],
        details: { password_hash: 'secret', count: 2 },
      }),
    ).toEqual({
      name: 'Admin',
      credentials: [{ access_token: '[REDACTED]', apiKey: '[REDACTED]' }],
      details: { password_hash: '[REDACTED]', count: 2 },
    });
  });

  it('denies Moderator and Rider access to every administrative permission', () => {
    const adminPermissions = [
      permissions.settingsView,
      permissions.settingsManage,
      permissions.usersView,
      permissions.usersCreate,
      permissions.usersUpdate,
      permissions.auditLogsView,
    ];
    for (const permission of adminPermissions) {
      expect(hasPermission('admin', permission)).toBe(true);
      expect(hasPermission('moderator', permission)).toBe(false);
      expect(hasPermission('rider', permission)).toBe(false);
    }
  });

  it('accepts invitations for exactly the three operational roles', () => {
    for (const role of ['admin', 'moderator', 'rider'] as const) {
      expect(
        memberInviteSchema.parse({ email: 'person@example.com', fullName: 'Person', role }).role,
      ).toBe(role);
    }
    expect(
      memberInviteSchema.safeParse({
        email: 'person@example.com',
        fullName: 'Person',
        role: 'owner',
      }).success,
    ).toBe(false);
  });

  it('blocks self-demotion, self-deactivation, and removal of the last active Admin', () => {
    const self = {
      actorUserId: 'user-1',
      targetUserId: 'user-1',
      currentRole: 'admin' as const,
      currentActive: true,
      activeAdminCount: 1,
    };
    expect(membershipChangeIssue({ ...self, role: 'moderator' })).toBe('SELF_LOCKOUT');
    expect(membershipChangeIssue({ ...self, isActive: false })).toBe('SELF_LOCKOUT');
    expect(membershipChangeIssue({ ...self, actorUserId: 'user-2', role: 'moderator' })).toBe(
      'LAST_ADMIN',
    );
    expect(
      membershipChangeIssue({
        ...self,
        actorUserId: 'user-2',
        activeAdminCount: 2,
        role: 'moderator',
      }),
    ).toBeNull();
  });

  it('allows active Rider eligibility only for active Rider accounts', () => {
    const rider = {
      actorUserId: 'admin-1',
      targetUserId: 'rider-1',
      currentRole: 'rider' as const,
      currentActive: true,
      activeAdminCount: 1,
    };
    expect(membershipChangeIssue({ ...rider, riderEligible: true })).toBeNull();
    expect(membershipChangeIssue({ ...rider, role: 'moderator', riderEligible: true })).toBe(
      'INVALID_RIDER_ELIGIBILITY',
    );
    expect(membershipChangeIssue({ ...rider, isActive: false, riderEligible: true })).toBe(
      'INVALID_RIDER_ELIGIBILITY',
    );
  });
});
