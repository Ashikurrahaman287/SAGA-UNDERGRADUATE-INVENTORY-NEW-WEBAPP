import { getSupabaseServerClient } from '../supabase';

export async function recordAuthEvent(input: {
  action: string;
  actorUserId?: string;
  entityId?: string;
  organizationId?: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await getSupabaseServerClient()
    .from('audit_logs')
    .insert({
      organization_id: input.organizationId,
      action: input.action,
      entity_type: 'authentication',
      entity_id: input.entityId,
      actor_user_id: input.actorUserId,
      request_id: input.requestId,
      after_data: input.metadata || null,
    });
}
