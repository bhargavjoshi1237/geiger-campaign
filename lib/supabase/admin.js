import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client on the SERVICE ROLE key, pinned to the campaign schema. It bypasses RLS,
// so only server routes import it (public ingest, tracking, webhooks, workers); it returns null in the
// browser, where SUPABASE_SERVICE_ROLE_KEY is never bundled.

export function isAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cached = null;

export function adminClient() {
  if (!isAdminConfigured()) return null;
  cached ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "campaign" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

// The shared suite tables (public.projects, public.profiles) through the same service-role client.
export function adminPublicClient() {
  return adminClient()?.schema("public") ?? null;
}
