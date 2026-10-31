import { handle, readJson } from "@/lib/server/http";
import { socialContext } from "@/lib/social/accounts/route_context";
import { connectTelegramBot } from "@/lib/social/accounts/connect";

// Connects a Telegram bot from its @BotFather token: getMe, store the token, register the webhook.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  return handle("social.telegram.connect", async () => {
    const { projectId, user, db } = await socialContext(params);
    const body = await readJson(request);
    const connection = await connectTelegramBot(db, { projectId, userId: user.id, token: body?.token, brand: body?.brand });
    return { connection };
  });
}
