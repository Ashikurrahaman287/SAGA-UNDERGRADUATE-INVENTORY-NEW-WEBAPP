import { z } from 'zod';

const browserEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

export function getBrowserConfig(): { supabaseUrl?: string; supabaseAnonKey?: string } {
  const result = browserEnvSchema.safeParse(import.meta.env);
  if (!result.success) throw new Error('Browser configuration is invalid.');
  return {
    supabaseUrl: result.data.VITE_SUPABASE_URL,
    supabaseAnonKey: result.data.VITE_SUPABASE_ANON_KEY,
  };
}
