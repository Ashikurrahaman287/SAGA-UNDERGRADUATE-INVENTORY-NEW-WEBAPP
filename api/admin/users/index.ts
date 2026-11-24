import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { getRequestId } from '../../lib/request-id.js';
import { sendJson } from '../../lib/response.js';
import { getServerEnv } from '../../lib/env.js';
import { getSupabaseServerClient } from '../../lib/supabase.js';
import { requirePermission } from '../../lib/auth/authorization-context.js';
import { methodNotAllowed, readJson, sendAuthFailure } from '../../lib/auth/http.js';
import { requireCsrf, requireSameOrigin } from '../../lib/auth/security.js';
import { permissions } from '../../../src/lib/permissions/permission-registry.js';
import { memberInviteSchema } from '../../../src/features/settings/member-validation.js';

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function users(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (methodNotAllowed(request, response, request.method === 'GET' ? 'GET' : 'POST')) return;
  const requestId = getRequestId(request);
  try {
    const isGet = request.method === 'GET';
    if (!isGet) {
      requireSameOrigin(request);
      requireCsrf(request);
    }
    const context = await requirePermission(
      request,
      response,
      isGet ? permissions.usersView : permissions.usersCreate,
    );
    if (!context) return;
    const admin = getSupabaseServerClient();

    if (isGet) {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
          role: z.enum(['admin', 'moderator', 'rider']).optional(),
          active: z.enum(['true', 'false']).optional(),
        })
        .parse({
          page: queryValue(request.query.page as string | string[] | undefined),
          pageSize: queryValue(request.query.pageSize as string | string[] | undefined),
          role: queryValue(request.query.role as string | string[] | undefined),
          active: queryValue(request.query.active as string | string[] | undefined),
        });
      let membershipQuery = admin
        .from('memberships')
        .select('id, user_id, role, is_active, rider_eligible, created_at', { count: 'exact' })
        .eq('organization_id', context.organization.id)
        .order('created_at', { ascending: false })
        .range((query.page - 1) * query.pageSize, query.page * query.pageSize - 1);
      if (query.role) membershipQuery = membershipQuery.eq('role', query.role);
      if (query.active) membershipQuery = membershipQuery.eq('is_active', query.active === 'true');
      const { data: memberships, count, error } = await membershipQuery;
      if (error) throw error;
      const userIds = (memberships || []).map((membership) => membership.user_id);
      const { data: profiles, error: profilesError } = userIds.length
        ? await admin.from('profiles').select('id, full_name, phone').in('id', userIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const emailById = new Map<string, string>();
      const remainingUserIds = new Set(userIds);
      for (let authPage = 1; remainingUserIds.size > 0; authPage += 1) {
        const authUsers = await admin.auth.admin.listUsers({ page: authPage, perPage: 1000 });
        if (authUsers.error) throw authUsers.error;
        for (const user of authUsers.data.users) {
          if (remainingUserIds.delete(user.id)) emailById.set(user.id, user.email || '');
        }
        if (authUsers.data.users.length < 1000) break;
      }
      const data = (memberships || []).map((membership) => {
        const profile = profileById.get(membership.user_id);
        return {
          id: membership.id,
          userId: membership.user_id,
          fullName: profile?.full_name || 'SAGA user',
          email: emailById.get(membership.user_id) || '',
          phone: profile?.phone || '',
          role: membership.role,
          isActive: membership.is_active,
          riderEligible: membership.role === 'rider' && membership.rider_eligible,
          createdAt: membership.created_at,
        };
      });
      sendJson(
        response,
        200,
        {
          data,
          pagination: { page: query.page, pageSize: query.pageSize, total: count || 0 },
          requestId,
        },
        requestId,
      );
      return;
    }

    const input = memberInviteSchema.parse(await readJson(request));
    const env = getServerEnv();
    if (!env.AUTH_REDIRECT_URL) throw new Error('Authentication configuration is unavailable.');
    const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      input.email,
      {
        data: { full_name: input.fullName },
        redirectTo: env.AUTH_REDIRECT_URL,
      },
    );
    if (inviteError || !invite.user) throw inviteError || new Error('Invite failed.');

    const { error: profileError } = await admin
      .from('profiles')
      .upsert({ id: invite.user.id, full_name: input.fullName });
    if (profileError) {
      await admin.auth.admin.deleteUser(invite.user.id);
      throw profileError;
    }
    const { error: membershipError } = await admin.rpc('admin_create_membership', {
      p_organization_id: context.organization.id,
      p_actor_user_id: context.auth.user.id,
      p_user_id: invite.user.id,
      p_role: input.role,
      p_request_id: requestId,
    });
    if (membershipError) {
      await admin.auth.admin.deleteUser(invite.user.id);
      throw membershipError;
    }
    sendJson(response, 201, { invited: true, requestId }, requestId);
  } catch (error) {
    sendAuthFailure(response, request, error);
  }
}
