import { randomUUID } from 'node:crypto';

export function getRequestId(request: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const header = request.headers['x-request-id'];
  return typeof header === 'string' && header.trim() ? header : randomUUID();
}
