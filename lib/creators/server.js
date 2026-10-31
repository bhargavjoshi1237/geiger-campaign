import { adminClient } from "@/lib/supabase/admin";
import { ApiError, notConfigured } from "@/lib/server/http";
import { CreatorLookupError } from "./instagram";

// Route plumbing shared by the creators handlers (server-only).

export const WRITE_KEY = "campaign.creator.manage";

// Service-role client for work that sends (deliveries) or reads secrets; callers authorize first.
export function serviceDb() {
  const db = adminClient();
  if (!db) throw notConfigured("Server database access isn't configured (SUPABASE_SERVICE_ROLE_KEY).");
  return db;
}

// Maps a lookup failure onto the route's error contract.
export function asApiError(error) {
  if (error instanceof CreatorLookupError) return new ApiError(error.status, error.message, error.code);
  return error;
}
