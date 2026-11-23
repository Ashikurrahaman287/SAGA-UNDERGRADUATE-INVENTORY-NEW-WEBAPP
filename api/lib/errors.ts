import type { VercelResponse } from '@vercel/node';
import { sendError } from './response';

export function handleApiError(response: VercelResponse, error: unknown, requestId: string): void {
  const message = error instanceof Error ? error.message : 'An unexpected server error occurred.';
  const safeMessage = message.includes('Invalid') ? 'The request could not be processed.' : message;
  sendError(response, 500, 'INTERNAL_ERROR', safeMessage, requestId);
}
