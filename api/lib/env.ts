import { z } from 'zod';

const serverEnvSchema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  AUTH_REDIRECT_URL: z.string().url().optional(),
  SWIFTSMS_API_KEY: z.string().min(1).optional(),
  SWIFTSMS_BASE_URL: z.string().url().optional(),
  EMAIL_PROVIDER: z.enum(['none', 'smtp', 'resend', 'postmark', 'sendgrid']).optional(),
  EMAIL_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse({
    SUPABASE_URL: source.SUPABASE_URL || undefined,
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY || undefined,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY || undefined,
    AUTH_REDIRECT_URL: source.AUTH_REDIRECT_URL || undefined,
    SWIFTSMS_API_KEY: source.SWIFTSMS_API_KEY || undefined,
    SWIFTSMS_BASE_URL: source.SWIFTSMS_BASE_URL || undefined,
    EMAIL_PROVIDER: source.EMAIL_PROVIDER || undefined,
    EMAIL_API_KEY: source.EMAIL_API_KEY || undefined,
    EMAIL_FROM_ADDRESS: source.EMAIL_FROM_ADDRESS || undefined,
  });
}

export function isServerConfigurationReady(source: NodeJS.ProcessEnv = process.env): boolean {
  const result = serverEnvSchema.safeParse({
    SUPABASE_URL: source.SUPABASE_URL || undefined,
    SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY || undefined,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY || undefined,
    AUTH_REDIRECT_URL: source.AUTH_REDIRECT_URL || undefined,
    SWIFTSMS_API_KEY: source.SWIFTSMS_API_KEY || undefined,
    SWIFTSMS_BASE_URL: source.SWIFTSMS_BASE_URL || undefined,
    EMAIL_PROVIDER: source.EMAIL_PROVIDER || undefined,
    EMAIL_API_KEY: source.EMAIL_API_KEY || undefined,
    EMAIL_FROM_ADDRESS: source.EMAIL_FROM_ADDRESS || undefined,
  });
  return Boolean(
    result.success &&
    result.data.SUPABASE_URL &&
    result.data.SUPABASE_ANON_KEY &&
    result.data.SUPABASE_SERVICE_ROLE_KEY,
  );
}
