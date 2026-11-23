import { z } from 'zod';

const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  AUTH_REDIRECT_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse({
    SUPABASE_URL: source.SUPABASE_URL || undefined,
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY || undefined,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY || undefined,
    AUTH_REDIRECT_URL: source.AUTH_REDIRECT_URL || undefined,
  });
}

export function isServerConfigurationReady(source: NodeJS.ProcessEnv = process.env): boolean {
  const result = serverEnvSchema.safeParse({
    SUPABASE_URL: source.SUPABASE_URL || undefined,
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY || undefined,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY || undefined,
    AUTH_REDIRECT_URL: source.AUTH_REDIRECT_URL || undefined,
  });
  return Boolean(
    result.success &&
    result.data.SUPABASE_URL &&
    result.data.SUPABASE_ANON_KEY &&
    result.data.SUPABASE_SERVICE_ROLE_KEY,
  );
}
