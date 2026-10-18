import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export { isSupabaseConfigured };

// Pre-guarded client pinned to this product's schema (null when unconfigured).
export function schemaClient() {
  return isSupabaseConfigured() ? createClient().schema("campaign") : null;
}

// Shared suite tables (public.projects, public.roles) live outside the product schema.
export function publicClient() {
  return isSupabaseConfigured() ? createClient().schema("public") : null;
}
