import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getServerEnv } from '../lib/env';
import { getRequestId } from '../lib/request-id';
import { sendJson } from '../lib/response';
import { recordAuthEvent } from '../lib/auth/audit';
import { methodNotAllowed, readJson, sendAuthFailure } from '../lib/auth/http';
import { requireCsrf, requireSameOrigin } from '../lib/auth/security';

const schema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
});
const genericMessage = 'If that account exists, password recovery instructions have been sent.';

export default async function forgotPassword(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response)) return;
  const requestId = getRequestId(request);
  try {
    requireSameOrigin(request);
    requireCsrf(request);
    const { email } = schema.parse(await readJson(request));
    const env = getServerEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.AUTH_REDIRECT_URL)
      throw new Error('Authentication configuration is unavailable.');
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await client.auth.resetPasswordForEmail(email, { redirectTo: env.AUTH_REDIRECT_URL });
    await recordAuthEvent({ action: 'password_recovery_requested', requestId });
    sendJson(response, 200, { message: genericMessage }, requestId);
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
