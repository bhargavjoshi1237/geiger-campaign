import { handle } from "@/lib/server/http";
import { ingestCommerceRequest } from "@/lib/commerce/ingest";

// Store webhooks and server-side commerce events (Shopify, WooCommerce, custom), HMAC-signed per store.
export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { storeId } = await params;
  return handle("commerce.ingest", () => ingestCommerceRequest(request, storeId));
}
