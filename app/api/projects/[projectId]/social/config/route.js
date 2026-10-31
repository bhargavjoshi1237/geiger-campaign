import { requireMember } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { isMetaConfigured, metaRedirectUri, metaWebhookUrl } from "@/lib/social/oauth/meta";
import { isTikTokConfigured, tiktokRedirectUri, tiktokWebhookUrl } from "@/lib/social/oauth/tiktok";
import { isSigningConfigured } from "@/lib/social/oauth/state";

// Which social connect flows this deployment can run, and the URLs to register with each platform.
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  return handle("social.config", async () => {
    const { projectId } = await params;
    await requireMember(projectId);
    const signing = isSigningConfigured();
    return {
      serverDb: isAdminConfigured(),
      signing,
      meta: {
        configured: isMetaConfigured() && signing,
        appConfigured: isMetaConfigured(),
        verifyTokenSet: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
        loginConfig: Boolean(process.env.META_LOGIN_CONFIG_ID),
        redirectUri: metaRedirectUri(),
        webhookUrl: metaWebhookUrl(),
      },
      tiktok: {
        configured: isTikTokConfigured() && signing,
        appConfigured: isTikTokConfigured(),
        redirectUri: tiktokRedirectUri(),
        webhookUrl: tiktokWebhookUrl(),
      },
      telegram: { configured: true },
      rcs: { configured: true },
    };
  });
}
