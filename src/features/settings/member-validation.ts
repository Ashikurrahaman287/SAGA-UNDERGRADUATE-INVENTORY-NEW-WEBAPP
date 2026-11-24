import { z } from 'zod';

export const memberInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  fullName: z.string().trim().min(1).max(200),
  role: z.enum(['admin', 'moderator', 'rider']),
});

export type OperationalRole = z.infer<typeof memberInviteSchema>['role'];

export type MembershipChange = {
  actorUserId: string;
  targetUserId: string;
  currentRole: OperationalRole;
  currentActive: boolean;
  activeAdminCount: number;
  role?: OperationalRole;
  isActive?: boolean;
  riderEligible?: boolean;
};

export function membershipChangeIssue(
  input: MembershipChange,
): 'SELF_LOCKOUT' | 'LAST_ADMIN' | 'INVALID_RIDER_ELIGIBILITY' | null {
  const nextRole = input.role ?? input.currentRole;
  const nextActive = input.isActive ?? input.currentActive;
  if (
    input.actorUserId === input.targetUserId &&
    (nextRole !== input.currentRole || (input.currentActive && !nextActive))
  ) {
    return 'SELF_LOCKOUT';
  }
  if (
    input.currentRole === 'admin' &&
    input.currentActive &&
    (nextRole !== 'admin' || !nextActive) &&
    input.activeAdminCount <= 1
  ) {
    return 'LAST_ADMIN';
  }
  if (input.riderEligible === true && (nextRole !== 'rider' || !nextActive)) {
    return 'INVALID_RIDER_ELIGIBILITY';
  }
  return null;
}
