import { requirePermission } from "@/lib/server/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readOAuthState } from "@/lib/social/oauth/state";
import { completeMetaConnect } from "@/lib/social/accounts/connect";
import { backToWorkspace, MANAGE } from "@/lib/social/accounts/route_context";

// Facebook Login redirect target. Project-agnostic because Meta requires an exact redirect URI; the signed
// state carries the project, the user who started the flow and the screen to return to.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const url = new URL(request.url);
  const state = readOAuthState(url.searchParams.get("state"), "meta");
  if (!state) return backToWorkspace(null, null, { social_error: "That connect link expired. Start again from Geiger Campaign." });
  const back = (params) => backToWorkspace(state.projectId, state.tab, params);

  if (url.searchParams.get("error")) {
    return back({ social_error: url.searchParams.get("error_description") || "Facebook login was cancelled." });
  }
  const code = url.searchParams.get("code");
  if (!code) return back({ social_error: "Facebook didn't return an authorization code." });

  try {
    const { user } = await requirePermission(state.projectId, MANAGE);
    if (user.id !== state.userId) return back({ social_error: "This connect link was started by someone else." });
    const db = adminClient();
    if (!db) return back({ social_error: "SUPABASE_SERVICE_ROLE_KEY isn't configured on the server." });
    const result = await completeMetaConnect(db, state, code);
    if (!result.connected) return back({ social_error: result.error });
    return back({ social_connected: String(result.connected), social_notes: result.skipped.slice(0, 3).join(" · ") });
  } catch (error) {
    console.error("[api.social.meta.callback]", error);
    return back({ social_error: error?.message || "Couldn't finish connecting." });
  }
}
