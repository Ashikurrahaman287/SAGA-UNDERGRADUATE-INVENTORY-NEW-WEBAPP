import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../request-id.js';
import { sendError, sendJson } from '../response.js';
import { SecurityError } from './security.js';

export async function readJson(request: VercelRequest): Promise<unknown> {
  if (!request.body) return {};
  if (typeof request.body === 'object') return request.body;
  try {
    return JSON.parse(request.body as string);
  } catch {
    throw new SecurityError('Invalid JSON body.', 'INVALID_JSON');
  }
}

export function methodNotAllowed(
  request: VercelRequest,
  response: VercelResponse,
  allowed = 'POST',
): boolean {
  if (request.method === allowed) return false;
  response.setHeader('Allow', allowed);
  sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', getRequestId(request));
  return true;
}

export function sendAuthFailure(
  response: VercelResponse,
  request: VercelRequest,
  error: unknown,
): void {
  const requestId = getRequestId(request);
  if (error instanceof SecurityError) {
    sendError(
      response,
      error.code === 'CSRF_FAILED' || error.code === 'INVALID_ORIGIN' ? 403 : 400,
      error.code,
      error.message,
      requestId,
    );
    return;
  }
  if (error instanceof z.ZodError) {
    sendError(response, 400, 'INVALID_REQUEST', 'The request could not be processed.', requestId);
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    const details = error instanceof Error ? `${error.name}: ${error.message}` : error;
    console.error(`[api] ${requestId} request failed`, details);
  }
  sendError(
    response,
    500,
    'REQUEST_FAILED',
    'The request could not be completed. Please try again.',
    requestId,
  );
}

export function jsonSuccess(
  response: VercelResponse,
  request: VercelRequest,
  status: number,
  body: unknown,
): void {
  sendJson(response, status, body, getRequestId(request));
}
