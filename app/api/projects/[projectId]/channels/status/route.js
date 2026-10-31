import { handle } from "@/lib/server/http";
import { requireMember } from "@/lib/server/auth";
import { isEmailConfigured } from "@/lib/email/client";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { isSigningConfigured } from "@/lib/server/tokens";
import { publicBaseUrl, publicUrl } from "@/lib/server/urls";

export const runtime = "nodejs";

// Deployment-level channel configuration the screens show honestly: is email delivery through Geiger
// Dash configured, can the server write logs, and the public URLs providers and SDKs call.
export async function GET(_request, { params }) {
  return handle("channels.status", async () => {
    const { projectId } = await params;
    await requireMember(projectId);
    let apiHost = "geiger.studio";
    try {
      apiHost = new URL(process.env.GEIGER_EMAIL_API_URL || "https://geiger.studio").host;
    } catch {
      // keep the default host
    }
    return {
      email: { configured: isEmailConfigured(), apiHost },
      server: { admin: isAdminConfigured(), signing: isSigningConfigured() },
      publicBaseUrl: publicBaseUrl(),
      urls: {
        messagesApi: publicUrl("/api/v1/messages"),
        twilioInbound: publicUrl("/api/webhooks/twilio/inbound"),
        twilioStatus: publicUrl("/api/webhooks/twilio/status"),
        inboundEmail: publicUrl("/api/public/inbound/email"),
        inAppMessages: publicUrl("/api/public/in-app/messages"),
        pushConfig: publicUrl("/api/public/push/config"),
        pushSubscribe: publicUrl("/api/public/push/subscribe"),
      },
    };
  });
}
