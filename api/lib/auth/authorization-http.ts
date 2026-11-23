import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendAuthFailure } from './http';
import { requirePermission } from './authorization-context';
import type { Permission } from '../../../src/lib/permissions/permission-registry';

export async function withPermission(
  request: VercelRequest,
  response: VercelResponse,
  permission: Permission,
  handler: (context: Awaited<ReturnType<typeof requirePermission>>) => Promise<void>,
): Promise<void> {
  try {
    const context = await requirePermission(request, response, permission);
    if (context) await handler(context);
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
