import { renderEmailDocument } from "@/lib/email/blocks";
import { applyMergeTags, contactMergeData } from "@/lib/email/merge_tags";
import { getWorkspaceSettings } from "@/lib/settings/server";

// Emails the creators area sends (outreach steps, deliverable reminders, rights requests), server-only.
// Copy is plain paragraphs with {{merge_tags}}, rendered through the shared email renderer so branding
// and the footer match campaign mail; dispatch() then sends it through geiger-dash.

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Workspace settings + the brand name to sign emails and pages with.
export async function creatorEmailContext(db, projectId) {
  const settings = await getWorkspaceSettings(db, projectId);
  let brandName = settings?.general?.name || "";
  if (!brandName) {
    const { data } = await db.schema("public").from("projects").select("name").eq("id", projectId).maybeSingle();
    brandName = data?.name || "";
  }
  return { settings, brandName };
}

// Merge values for a creator: {{first_name}}, {{name}}, {{handle}}, {{instagram}}, {{brand_name}}…
export function creatorMergeData(creator = {}, extra = {}) {
  const name = String(creator.name || "").trim();
  const [first = "", ...rest] = name.split(/\s+/);
  const handles = creator.handles && typeof creator.handles === "object" ? creator.handles : {};
  const handle = handles.instagram || handles.tiktok || handles.youtube || handles.x || "";
  return {
    ...contactMergeData({ first_name: first, last_name: rest.join(" "), email: creator.email || "" }),
    name,
    creator_name: name,
    handle: handle ? `@${handle}` : "",
    instagram: handles.instagram ? `@${handles.instagram}` : "",
    tiktok: handles.tiktok ? `@${handles.tiktok}` : "",
    ...extra,
  };
}

// "Name <email>" for the sender, falling back to the workspace sending defaults (or dash's default).
export function senderAddress(sender = {}, settings = {}) {
  const fromEmail = sender.fromEmail || settings?.sending?.fromEmail || "";
  const fromName = sender.fromName || settings?.sending?.fromName || "";
  if (!fromEmail) return undefined;
  return fromName ? `${fromName.replace(/[<>"]/g, "")} <${fromEmail}>` : fromEmail;
}

// Renders subject + body paragraphs (merge tags applied) to { subject, html }.
export function buildCreatorEmail({ subject, body, mergeData = {}, brand = {}, footer = "", preheader = "" }) {
  const finalSubject = applyMergeTags(subject, mergeData).trim();
  const paragraphs = applyMergeTags(body, mergeData)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const blocks = paragraphs.map((text, i) => ({ id: `p${i + 1}`, type: "text", props: { text } }));
  if (footer) blocks.push({ id: "footer", type: "text", props: { text: footer, size: "small", muted: true } });

  let html = "";
  try {
    html = renderEmailDocument({ blocks, settings: {} }, { mergeData, brand, preheader })?.html || "";
  } catch (error) {
    console.error("[creators.email.render]", error);
  }
  if (!html) {
    const body = [...paragraphs, footer].filter(Boolean).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
    html = `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${body}</body></html>`;
  }
  return { subject: finalSubject, html };
}
