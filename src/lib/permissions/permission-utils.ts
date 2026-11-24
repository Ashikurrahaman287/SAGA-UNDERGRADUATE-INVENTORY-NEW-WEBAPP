import type { AuthRole } from '../../features/auth/auth-store.js';
import { rolePermissions, type Permission } from './permission-registry.js';

export type { Permission };

export function hasPermission(role: AuthRole | undefined, permission: Permission): boolean {
  return role ? rolePermissions[role].includes(permission) : false;
}

export function hasAnyPermission(
  role: AuthRole | undefined,
  requested: readonly Permission[],
): boolean {
  return requested.some((permission) => hasPermission(role, permission));
}

export function hasAllPermissions(
  role: AuthRole | undefined,
  requested: readonly Permission[],
): boolean {
  return requested.every((permission) => hasPermission(role, permission));
}

export function canAccessRoute(
  role: AuthRole | undefined,
  required: Permission | readonly Permission[],
): boolean {
  return typeof required === 'string'
    ? hasPermission(role, required)
    : hasAnyPermission(role, required);
}
