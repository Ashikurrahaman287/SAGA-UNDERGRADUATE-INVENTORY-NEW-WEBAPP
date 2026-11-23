import type { VercelResponse } from '@vercel/node';

export type ApiErrorBody = { error: { code: string; message: string }; requestId: string };

export function sendJson(
  response: VercelResponse,
  status: number,
  body: unknown,
  requestId: string,
): void {
  response
    .status(status)
    .setHeader('Content-Type', 'application/json')
    .setHeader('X-Request-ID', requestId)
    .json(body);
}

export function sendError(
  response: VercelResponse,
  status: number,
  code: string,
  message: string,
  requestId: string,
): void {
  const body: ApiErrorBody = { error: { code, message }, requestId };
  sendJson(response, status, body, requestId);
}
