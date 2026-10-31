import { requirePermission } from "@/lib/server/auth";
import { adminClient } from "@/lib/supabase/admin";
import { completeAdsOAuth, readAdsOAuthState } from "@/lib/ads/connect";
import { ADS_MANAGE, backToAds, metaAdsRedirectUri } from "@/lib/ads/route_context";

// Facebook Login redirect target for ad accounts. Project-agnostic because Meta requires an exact redirect
// URI; the signed state carries the project and the user who started the flow.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request) {
  const url = new URL(request.url);
  const state = readAdsOAuthState(url.searchParams.get("state"));
  if (!state) return backToAds(null, { ads: "error", reason: "That connect link expired. Start again from Ad Campaigns." });
  const back = (params) => backToAds(state.projectId, params);
  if (url.searchParams.get("error")) {
    return back({ ads: "error", reason: url.searchParams.get("error_description") || "Facebook login was cancelled." });
  }
  const code = url.searchParams.get("code");
  if (!code) return back({ ads: "error", reason: "Facebook didn't return an authorization code." });
  try {
    const { user } = await requirePermission(state.projectId, ADS_MANAGE);
    if (user.id !== state.userId) return back({ ads: "error", reason: "This connect link was started by someone else." });
    const db = adminClient();
    if (!db) return back({ ads: "error", reason: "SUPABASE_SERVICE_ROLE_KEY isn't configured on the server." });
    const result = await completeAdsOAuth(db, { projectId: state.projectId, userId: user.id, code, redirectUri: metaAdsRedirectUri() });
    if (!result.ok) return back({ ads: "error", reason: result.error });
    return back({ ads: "connected", connected: result.connected, pending: result.pending });
  } catch (error) {
    console.error("[api.ads.oauth.callback]", error);
    return back({ ads: "error", reason: error?.message || "Couldn't finish connecting." });
  }
}
