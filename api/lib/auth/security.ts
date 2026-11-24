import { createHash, randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { stringifySetCookie } from 'cookie';
import { getSupabaseServerClient } from '../supabase';

const csrfCookie = 'saga_csrf';
const isProduction = process.env.NODE_ENV === 'production';

export function getCookie(request: VercelRequest, name: string): string | undefined {
  return request.cookies?.[name];
}

export function setCsrfCookie(
  response: VercelResponse,
  token = randomBytes(24).toString('hex'),
): string {
  response.setHeader(
    'Set-Cookie',
    stringifySetCookie({
      name: csrfCookie,
      value: token,
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    }),
  );
  return token;
}

export function requireCsrf(request: VercelRequest): void {
  const cookie = getCookie(request, csrfCookie);
  const header = request.headers['x-csrf-token'];
  if (!cookie || typeof header !== 'string' || cookie !== header)
    throw new SecurityError('CSRF validation failed.', 'CSRF_FAILED');
}

export function requireSameOrigin(request: VercelRequest): void {
  const origin = request.headers.origin;
  if (!origin) return;
  const host = request.headers.host;
  if (!host || new URL(origin).host !== host)
    throw new SecurityError('Invalid request origin.', 'INVALID_ORIGIN');
}

export function hashRateKey(ip: string, email: string): string {
  return createHash('sha256').update(`${ip}|${email.trim().toLowerCase()}`).digest('hex');
}

export function getClientIp(request: VercelRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  return (
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]
      : request.socket.remoteAddress || 'unknown'
  ).trim();
}

export async function consumeLoginLimit(
  request: VercelRequest,
  email: string,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const result = await getSupabaseServerClient().rpc('consume_auth_rate_limit', {
    p_rate_key: hashRateKey(getClientIp(request), email),
    p_limit: 8,
    p_window_seconds: 900,
  });
  if (result.error || !result.data?.[0]) return { allowed: false, retryAfter: 60 };
  return { allowed: result.data[0].allowed, retryAfter: result.data[0].retry_after_seconds };
}

export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}
