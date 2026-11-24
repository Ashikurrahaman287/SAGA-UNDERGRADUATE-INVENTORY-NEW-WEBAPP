import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServerClient } from '@supabase/ssr';
import { stringifySetCookie } from 'cookie';
import { getServerEnv } from '../env.js';
import { getCookie } from './security.js';

export type AuthContext = {
  user: { id: string; email?: string; name: string };
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    currency: string;
    timezone: string;
    role: 'admin' | 'moderator' | 'rider';
  }>;
  organization?: {
    organizationId: string;
    organizationName: string;
    currency: string;
    timezone: string;
    role: 'admin' | 'moderator' | 'rider';
  };
};

const isProduction = process.env.NODE_ENV === 'production';

export function createAuthClient(request: VercelRequest, response: VercelResponse) {
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
    throw new Error('Authentication configuration is unavailable.');
  const cookiesToSet: string[] = [];
  const client = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Object.entries(request.cookies || {}).map(([name, value]) => ({ name, value })),
      setAll: (cookies) =>
        cookies.forEach(({ name, value, options }) =>
          cookiesToSet.push(
            stringifySetCookie({
              name,
              value,
              ...options,
              httpOnly: true,
              secure: isProduction,
              sameSite: 'lax',
              path: '/',
            }),
          ),
        ),
    },
  });
  return {
    client,
    commit: () => {
      if (cookiesToSet.length) response.setHeader('Set-Cookie', cookiesToSet);
    },
  };
}

export function clearAuthCookies(request: VercelRequest, response: VercelResponse): void {
  const names = Object.keys(request.cookies || {}).filter(
    (name) => name.startsWith('sb-') || name === 'saga_org_id',
  );
  if (names.length)
    response.setHeader(
      'Set-Cookie',
      names.map((name) =>
        stringifySetCookie({
          name,
          value: '',
          httpOnly: name.startsWith('sb-'),
          secure: isProduction,
          sameSite: 'lax',
          path: '/',
          maxAge: 0,
        }),
      ),
    );
}

export async function getAuthContext(
  request: VercelRequest,
  response: VercelResponse,
): Promise<{
  client: ReturnType<typeof createAuthClient>['client'];
  context: AuthContext | null;
  commit: () => void;
}> {
  const auth = createAuthClient(request, response);
  const {
    data: { user },
  } = await auth.client.auth.getUser();
  if (!user) {
    auth.commit();
    return { client: auth.client, context: null, commit: auth.commit };
  }
  const { data: rows, error } = await auth.client
    .from('memberships')
    .select('organization_id, role, organizations(id, name, currency, timezone)')
    .eq('user_id', user.id)
    .eq('is_active', true);
  if (error) throw error;
  const memberships = (rows || []).flatMap((row) => {
    const organization = Array.isArray(row.organizations)
      ? row.organizations[0]
      : row.organizations;
    return organization
      ? [
          {
            organizationId: row.organization_id,
            organizationName: organization.name,
            currency: organization.currency,
            timezone: organization.timezone,
            role: row.role as AuthContext['memberships'][number]['role'],
          },
        ]
      : [];
  });
  const selected = getCookie(request, 'saga_org_id');
  const organization =
    memberships.find((membership) => membership.organizationId === selected) ||
    (memberships.length === 1 ? memberships[0] : undefined);
  auth.commit();
  return {
    client: auth.client,
    context: {
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email || 'SAGA user',
      },
      memberships,
      organization,
    },
    commit: auth.commit,
  };
}
