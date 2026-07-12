import { createBrowserClient } from '@supabase/ssr';
import { trackSupabaseFetch } from './activity';

// True only when both Supabase env vars are present. Guard every DB call with it
// so a missing env returns null/[]/false (the screen shows an empty state) rather
// than crashing.
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        fetch: trackSupabaseFetch,
      },
    }
  );
}
