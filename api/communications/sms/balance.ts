import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestId } from '../../lib/request-id';
import { sendJson } from '../../lib/response';
import { sendAuthFailure, methodNotAllowed } from '../../lib/auth/http';
import { requirePermission } from '../../lib/auth/authorization-context';
import { permissions } from '../../../src/lib/permissions/permission-registry';
import { getSwiftSmsBalance } from '../../_lib/swiftsms';

export default async function smsBalance(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, 'GET')) return;
  try {
    const context = await requirePermission(request, response, permissions.communicationsManage);
    if (!context) return;
    const balance = await getSwiftSmsBalance();
    sendJson(
      response,
      200,
      { data: balance, requestId: getRequestId(request) },
      getRequestId(request),
    );
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
