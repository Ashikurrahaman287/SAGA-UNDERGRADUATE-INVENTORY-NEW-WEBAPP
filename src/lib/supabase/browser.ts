import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getBrowserConfig } from '../config';

let client: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | undefined {
  if (client) return client;
  const { supabaseUrl, supabaseAnonKey } = getBrowserConfig();
  if (!supabaseUrl || !supabaseAnonKey) return undefined;
  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}
