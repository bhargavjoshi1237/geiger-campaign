import { dispatch } from "@/lib/messaging/dispatch";
import { getWorkspaceSettings } from "@/lib/settings/server";
import { adminClient } from "@/lib/supabase/admin";
import { isSigningConfigured, signToken } from "@/lib/server/tokens";
import { publicUrl } from "@/lib/server/urls";
import { ApiError, badRequest, notConfigured, notFound } from "@/lib/server/http";
import { renderCartReminderEmail } from "./email";

// One-off abandoned-cart reminder sent from the Abandoned Carts screen (server-only). Goes out through
// dispatch() like every other message, only to subscribed contacts, idempotent per reminder number.

export async function sendCartReminder(db, projectId, cartId) {
  const { data: cart, error } = await db
    .from("carts")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", cartId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new ApiError(500, "Couldn't load the cart.", "cart_load_failed");
  if (!cart) throw notFound("Cart not found.");
  if (cart.status === "recovered" || cart.status === "converted") throw badRequest("This cart already turned into an order.");
  if (cart.status !== "abandoned") throw badRequest("Only abandoned carts get reminders.");
  if (!cart.contact_id) throw badRequest("The store didn't send an email address for this shopper.");

  const { data: contact } = await db
    .from("contacts")
    .select("id, email, first_name, status")
    .eq("id", cart.contact_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact?.email) throw badRequest("This shopper has no email address.");
  if (contact.status !== "subscribed") {
    throw badRequest(`${contact.email} hasn't opted in to marketing email (status: ${contact.status}).`);
  }

  const admin = adminClient();
  if (!admin) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured, so messages can't be logged or sent.");
  const { data: store } = await db.from("stores").select("name").eq("id", cart.store_id).maybeSingle();
  const settings = await getWorkspaceSettings(admin, projectId);
  const sending = settings?.sending || {};
  const from = sending.fromEmail ? (sending.fromName ? `${sending.fromName} <${sending.fromEmail}>` : sending.fromEmail) : undefined;
  const attempt = Number(cart.reminders_sent || 0) + 1;

  const result = await dispatch({
    db: admin,
    projectId,
    channel: "email",
    to: contact.email,
    contactId: contact.id,
    source: { type: "commerce", id: cart.id },
    idempotencyKey: `cart-reminder:${cart.id}:${attempt}`,
    metadata: { kind: "cart_reminder", cart_id: cart.id, attempt },
    message: ({ deliveryId }) => {
      const unsubscribeUrl = isSigningConfigured()
        ? publicUrl(`/u/${signToken({ k: "unsub", d: deliveryId }, { ttlDays: 365 })}`)
        : "";
      const { subject, html } = renderCartReminderEmail({
        cart,
        storeName: store?.name || "our store",
        firstName: contact.first_name || "",
        brand: settings?.branding || {},
        unsubscribeUrl,
      });
      return { subject, html, from, label: "campaign.cart_reminder" };
    },
  });

  if (result.status === "not_sent") throw notConfigured(result.error || "Email delivery isn't configured.");
  if (result.status === "failed") throw new ApiError(502, result.error || "The email couldn't be sent.", "send_failed");

  const lastRemindedAt = new Date().toISOString();
  if (!result.duplicate) {
    await db.from("carts").update({ reminders_sent: attempt, last_reminded_at: lastRemindedAt }).eq("id", cart.id);
  }
  return { status: result.status, deliveryId: result.deliveryId, remindersSent: attempt, lastRemindedAt };
}
