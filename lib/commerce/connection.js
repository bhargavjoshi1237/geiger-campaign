import { adminClient } from "@/lib/supabase/admin";
import { publicUrl } from "@/lib/server/urls";
import { ApiError, badRequest, notConfigured, notFound } from "@/lib/server/http";
import { generateStoreSecret, secretHint } from "./signature";
import { platformInfo } from "./platforms";

// Store connection details (server-only): the public ingest URL and the webhook signing secret. Geiger
// generates secrets for WooCommerce and custom stores (shown once); Shopify signs with its own secret,
// which the merchant pastes in. Secrets live in campaign.store_secrets, readable by the service role only.

export function ingestUrlFor(storeId) {
  return publicUrl(`/api/public/commerce/${storeId}/events`);
}

async function loadStore(db, projectId, storeId) {
  const { data, error } = await db
    .from("stores")
    .select("id, platform, secret_hint, secret_rotated_at")
    .eq("project_id", projectId)
    .eq("id", storeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new ApiError(500, "Couldn't load the store.", "store_load_failed");
  if (!data) throw notFound("Store not found.");
  return data;
}

function describe(store, overrides = {}) {
  const info = platformInfo(store.platform);
  const hint = overrides.hint ?? store.secret_hint ?? "";
  return {
    storeId: store.id,
    platform: info.key,
    ingestUrl: ingestUrlFor(store.id),
    configured: Boolean(hint),
    hint,
    rotatedAt: overrides.rotatedAt ?? store.secret_rotated_at ?? null,
    secretSource: info.secretSource,
    signatureHeader: info.signatureHeader,
    topics: info.topics,
  };
}

export async function getStoreConnection(db, projectId, storeId) {
  return describe(await loadStore(db, projectId, storeId));
}

// Generates (or, for Shopify, saves the pasted) signing secret. The generated secret is returned once.
export async function setStoreSecret(db, projectId, storeId, { secret: provided } = {}) {
  const store = await loadStore(db, projectId, storeId);
  const admin = adminClient();
  if (!admin) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured, so signing secrets can't be stored.");
  const info = platformInfo(store.platform);

  let secret;
  if (info.secretSource === "store") {
    secret = String(provided || "").trim();
    if (secret.length < 16 || /\s/.test(secret)) {
      throw badRequest("Paste the webhook signing secret Shopify shows under Settings → Notifications → Webhooks.");
    }
  } else {
    secret = generateStoreSecret();
  }

  const { error } = await admin
    .from("store_secrets")
    .upsert({ project_id: projectId, store_id: store.id, secret }, { onConflict: "store_id" });
  if (error) throw new ApiError(500, "Couldn't save the signing secret.", "secret_save_failed");

  const rotatedAt = new Date().toISOString();
  const hint = secretHint(secret);
  const { error: updateError } = await db
    .from("stores")
    .update({ secret_hint: hint, secret_rotated_at: rotatedAt })
    .eq("id", store.id);
  if (updateError) throw new ApiError(500, "The secret was saved but the store couldn't be updated.", "store_update_failed");

  return { ...describe(store, { hint, rotatedAt }), secret: info.secretSource === "geiger" ? secret : null };
}
