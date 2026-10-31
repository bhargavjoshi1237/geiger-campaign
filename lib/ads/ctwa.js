import { graphRequest } from "@/lib/social/meta_graph";
import { ApiError, badRequest } from "@/lib/server/http";
import { AD_REFERRAL_EVENTS, destinationMeta, minorUnitFactor, referralContext } from "./catalog";
import { graphErrorMessage, setEntityStatus } from "./meta_ads";

// Click-to-Message ads (server-only): publishes a draft as campaign -> ad set -> creative -> ad on the
// Marketing API (each step resumable), keeps a Chat automation entry point in step so the referral is
// answered by the mapped DM flow, and rolls up conversations started per ad.

const bag = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

// The WhatsApp number linked to the page, as Meta expects it (+E.164 digits).
function whatsappNumber(connection) {
  const c = bag(connection?.config);
  const raw = c.displayPhoneNumber || c.display_phone_number || c.phoneNumber || c.phone || connection?.display_handle || "";
  const digits = String(raw).replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

// Welcome message + ice breakers in Meta's visual-editor format; WhatsApp gets a prefilled message carrying the ref.
function welcomeMessage(ad) {
  const breakers = (Array.isArray(ad.ice_breakers) ? ad.ice_breakers : []).filter((b) => b?.title).slice(0, 4);
  const text = ad.welcome_message || "Hi! How can we help?";
  if (ad.destination === "whatsapp") {
    return {
      type: "VISUAL_EDITOR",
      version: 2,
      landing_screen_type: "welcome_message",
      media_type: "text",
      text_format: {
        customer_action_type: breakers.length ? "ice_breakers" : "autofill_message",
        message: {
          text,
          ...(breakers.length
            ? { ice_breakers: breakers.map((b) => ({ title: b.title.slice(0, 80), response: "" })), quick_replies: [] }
            : { autofill_message: { content: `Hi! I'd like to know more [${ad.ref}]` } }),
        },
      },
      user_edit: false,
      surface: "visual_editor_new",
    };
  }
  return {
    type: "VISUAL_EDITOR",
    version: 2,
    landing_screen_type: "welcome_message",
    media_type: "text",
    text_format: {
      customer_action_type: "ice_breakers",
      message: {
        text,
        ice_breakers: (breakers.length ? breakers : [{ title: "Tell me more" }]).map((b) => ({ title: b.title.slice(0, 80), response: "" })),
        quick_replies: [],
      },
    },
    user_edit: false,
    surface: "visual_editor_new",
  };
}

async function loadPublishContext(db, ad) {
  if (!ad.ad_account_id) throw badRequest("Choose an ad account before publishing.");
  const { data: account } = await db.from("ad_accounts").select("*").eq("id", ad.ad_account_id).is("deleted_at", null).maybeSingle();
  if (!account || account.status !== "connected") throw new ApiError(409, "The ad account isn't connected.", "not_connected");
  const { data: secretRow } = await db.from("ad_account_secrets").select("secrets").eq("ad_account_id", account.id).maybeSingle();
  const token = secretRow?.secrets?.accessToken;
  if (!token) throw new ApiError(409, "The ad account has no access token — reconnect it.", "not_connected");
  const pageId = ad.fb_page_id || account.page_ids?.[0];
  if (!pageId) throw badRequest("Choose the Facebook page the ad runs from.");
  const page = (account.pages || []).find((p) => String(p.id) === String(pageId)) || { id: pageId };
  let connection = null;
  if (ad.connection_id) {
    const { data } = await db.from("channel_connections").select("*").eq("id", ad.connection_id).is("deleted_at", null).maybeSingle();
    connection = data || null;
  }
  return { account, token, page, connection };
}

async function setAdFields(db, ad, patch) {
  const { data, error } = await db.from("ctwa_ads").update(patch).eq("id", ad.id).select("*").single();
  if (error) console.error("[ads.ctwa.update]", error.message);
  return data || { ...ad, ...patch };
}

// Creates (or resumes creating) the campaign, ad set, creative and ad on Meta; leaves everything PAUSED
// unless `activate`. Returns the updated ctwa_ads row.
export async function publishCtwaAd(db, ad, { activate = false } = {}) {
  const dest = destinationMeta(ad.destination);
  const { account, token, page, connection } = await loadPublishContext(db, ad);
  const mediaUrl = ad.media_url;
  if (!mediaUrl) throw badRequest("Add an image to the ad (from the Creative Library or a URL).");
  const phone = ad.destination === "whatsapp" ? whatsappNumber(connection) : null;
  if (ad.destination === "whatsapp" && !phone) throw badRequest("Choose the WhatsApp number this ad opens (linked to the page).");
  if (ad.destination === "instagram" && !page.igUserId) throw badRequest("The page has no linked Instagram account.");

  let row = await setAdFields(db, ad, { status: "publishing", last_error: null });
  const fail = async (res, step) => {
    const message = `${step}: ${graphErrorMessage(res)}`;
    row = await setAdFields(db, row, { status: "failed", last_error: message });
    return row;
  };

  if (!row.external_campaign_id) {
    const res = await graphRequest(`${account.external_id}/campaigns`, {
      token,
      method: "POST",
      body: {
        name: row.name,
        objective: row.objective || "OUTCOME_ENGAGEMENT",
        status: "PAUSED",
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false,
      },
    });
    if (!res.ok) return fail(res, "Campaign");
    row = await setAdFields(db, row, { external_campaign_id: String(res.data.id) });
  }

  if (!row.external_adset_id) {
    const targeting = bag(row.targeting);
    const countries = (targeting.countries || []).map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
    const res = await graphRequest(`${account.external_id}/adsets`, {
      token,
      method: "POST",
      body: {
        name: `${row.name} · ad set`,
        campaign_id: row.external_campaign_id,
        daily_budget: Math.round(Number(row.daily_budget || 0) * minorUnitFactor(account.currency)),
        billing_event: "IMPRESSIONS",
        optimization_goal: "CONVERSATIONS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        destination_type: dest.destinationType,
        promoted_object: { page_id: String(page.id), ...(phone ? { whatsapp_phone_number: phone } : {}) },
        targeting: {
          geo_locations: { countries: countries.length ? countries : ["US"] },
          age_min: Math.max(18, Number(targeting.ageMin) || 18),
          age_max: Math.min(65, Number(targeting.ageMax) || 65),
          targeting_automation: { advantage_audience: 0 },
        },
        status: "PAUSED",
      },
    });
    if (!res.ok) return fail(res, "Ad set");
    row = await setAdFields(db, row, { external_adset_id: String(res.data.id) });
  }

  if (!row.external_creative_id) {
    const res = await graphRequest(`${account.external_id}/adcreatives`, {
      token,
      method: "POST",
      body: {
        name: `${row.name} · creative`,
        object_story_spec: {
          page_id: String(page.id),
          ...(ad.destination === "instagram" ? { instagram_user_id: String(page.igUserId) } : {}),
          link_data: {
            message: row.primary_text || "",
            name: row.headline || undefined,
            picture: mediaUrl,
            link: dest.link,
            call_to_action: { type: dest.cta, value: { app_destination: dest.appDestination } },
            page_welcome_message: JSON.stringify(welcomeMessage(row)),
          },
        },
      },
    });
    if (!res.ok) return fail(res, "Creative");
    row = await setAdFields(db, row, { external_creative_id: String(res.data.id) });
  }

  if (!row.external_ad_id) {
    const res = await graphRequest(`${account.external_id}/ads`, {
      token,
      method: "POST",
      body: { name: row.name, adset_id: row.external_adset_id, creative: { creative_id: row.external_creative_id }, status: "PAUSED" },
    });
    if (!res.ok) return fail(res, "Ad");
    row = await setAdFields(db, row, { external_ad_id: String(res.data.id), published_at: new Date().toISOString() });
  }

  await syncEntryPoint(db, row);
  if (activate) return setCtwaStatus(db, row, "ACTIVE", { token });
  return setAdFields(db, row, { status: "paused", last_error: null, fb_page_id: String(page.id) });
}

// Pause / resume the whole chain (campaign, ad set, ad) so a resumed ad actually delivers.
export async function setCtwaStatus(db, ad, status, { token: given = null } = {}) {
  if (!ad.external_ad_id) throw badRequest("Publish the ad first.");
  let token = given;
  if (!token) {
    const { data: secretRow } = await db.from("ad_account_secrets").select("secrets").eq("ad_account_id", ad.ad_account_id).maybeSingle();
    token = secretRow?.secrets?.accessToken;
  }
  if (!token) throw new ApiError(409, "The ad account has no access token — reconnect it.", "not_connected");
  const chain = status === "ACTIVE"
    ? [ad.external_campaign_id, ad.external_adset_id, ad.external_ad_id]
    : [ad.external_ad_id];
  for (const id of chain.filter(Boolean)) {
    const res = await setEntityStatus(token, id, status);
    if (!res.ok) return setAdFields(db, ad, { last_error: graphErrorMessage(res) });
  }
  return setAdFields(db, ad, { status: status === "ACTIVE" ? "active" : "paused", last_error: null });
}

// Keeps a Chat automation entry point (kind "ctwa") pointing at the ad's flow, matched by ref and ad id.
export async function syncEntryPoint(db, ad) {
  try {
    const { data: existing } = await db
      .from("entry_points")
      .select("id, config")
      .eq("project_id", ad.project_id)
      .eq("kind", "ctwa")
      .eq("ref", ad.ref)
      .is("deleted_at", null)
      .maybeSingle();
    const row = {
      project_id: ad.project_id,
      name: `Ad: ${ad.name}`,
      kind: "ctwa",
      channel: ad.destination,
      connection_id: ad.connection_id || null,
      ref: ad.ref,
      flow_id: ad.flow_id || null,
      status: ad.status === "archived" ? "paused" : "active",
      config: { ...bag(existing?.config), adIds: ad.external_ad_id ? [ad.external_ad_id] : [] },
      metadata: { source: "ads", ctwaAdId: ad.id },
    };
    const { error } = existing
      ? await db.from("entry_points").update(row).eq("id", existing.id)
      : await db.from("entry_points").insert(row);
    if (error) console.error("[ads.ctwa.entryPoint]", error.message);
  } catch (e) {
    console.error("[ads.ctwa.entryPoint]", e);
  }
}

// For the chat engine: which flow answers a referral from an ad (matched by ad id, then ref).
export async function findCtwaRoute(db, { projectId, adId = null, ref = null }) {
  if (!db || !projectId || (!adId && !ref)) return null;
  let query = db.from("ctwa_ads").select("id, name, destination, flow_id, automation_id, welcome_message, ref, external_ad_id").eq("project_id", projectId).is("deleted_at", null);
  query = adId ? query.eq("external_ad_id", String(adId)) : query.eq("ref", String(ref));
  const { data } = await query.limit(1).maybeSingle();
  if (!data) return adId && ref ? findCtwaRoute(db, { projectId, ref }) : null;
  return { ctwaAdId: data.id, name: data.name, destination: data.destination, flowId: data.flow_id, automationId: data.automation_id, welcomeMessage: data.welcome_message, ref: data.ref };
}

// Worker: per-ad stats from the ad's insights snapshot + threads opened from referral events (30 days),
// and entry points re-synced when an ad's flow mapping changed.
export async function refreshCtwaStats(db, { now = Date.now(), limit = 200 } = {}) {
  const { data: ads } = await db
    .from("ctwa_ads")
    .select("*")
    .is("deleted_at", null)
    .not("external_ad_id", "is", null)
    .limit(limit);
  let updated = 0;
  const since = new Date(now - 30 * 86_400_000).toISOString();
  const byProject = new Map();
  for (const ad of ads || []) {
    if (!byProject.has(ad.project_id)) byProject.set(ad.project_id, []);
    byProject.get(ad.project_id).push(ad);
  }
  for (const [projectId, list] of byProject) {
    const [{ data: snaps }, { data: events }, { data: entries }] = await Promise.all([
      db.from("ad_campaign_snapshots").select("external_id, insights, captured_at").eq("project_id", projectId).eq("level", "ad").in("external_id", list.map((a) => a.external_ad_id)),
      db.from("tracked_events").select("properties").eq("project_id", projectId).in("name", AD_REFERRAL_EVENTS).gte("occurred_at", since).limit(20_000),
      db.from("entry_points").select("ref, flow_id, config").eq("project_id", projectId).eq("kind", "ctwa").is("deleted_at", null),
    ]);
    const entryMap = new Map((entries || []).map((e) => [e.ref, e]));
    const snapMap = new Map((snaps || []).map((s) => [s.external_id, s]));
    const threads = new Map();
    for (const e of events || []) {
      const ctx = referralContext(e.properties);
      const ad = list.find((a) => (ctx.adId && ctx.adId === a.external_ad_id) || (ctx.ref && ctx.ref === a.ref));
      if (ad) threads.set(ad.id, (threads.get(ad.id) || 0) + 1);
    }
    for (const ad of list) {
      const snap = snapMap.get(ad.external_ad_id);
      const i = bag(snap?.insights);
      const stats = {
        ...bag(ad.stats),
        threads: threads.get(ad.id) || 0,
        ...(snap
          ? {
              conversationsStarted: Number(i.conversations) || 0,
              spend: Number(i.spend) || 0,
              impressions: Number(i.impressions) || 0,
              clicks: Number(i.clicks) || 0,
              costPerConversation: i.costPerConversation ?? null,
              syncedAt: snap.captured_at,
            }
          : {}),
      };
      const { error } = await db.from("ctwa_ads").update({ stats }).eq("id", ad.id);
      if (!error) updated += 1;
      // Keep the chat entry point in step when the flow mapping changed in the editor.
      const entry = entryMap.get(ad.ref);
      if (!entry || (entry.flow_id || null) !== (ad.flow_id || null) || !(entry.config?.adIds || []).includes(ad.external_ad_id)) {
        await syncEntryPoint(db, ad);
      }
    }
  }
  return { updated };
}
