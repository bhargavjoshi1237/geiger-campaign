import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/auth";
import { notConfigured, notFound } from "@/lib/server/http";
import { publicUrl } from "@/lib/server/urls";
import { adminClient } from "@/lib/supabase/admin";
import { loadProjectConnection } from "./store";

// Route plumbing for the social endpoints: permission check on the user session, then the service-role db for
// connection + secret writes (channel_secrets is server-only).

export const MANAGE = "campaign.channel.manage";

export async function socialContext(params, permission = MANAGE) {
  const { projectId, connectionId } = await params;
  const { user } = await requirePermission(projectId, permission);
  const db = adminClient();
  if (!db) throw notConfigured("SUPABASE_SERVICE_ROLE_KEY isn't configured on the server.");
  return { projectId, connectionId, user, db };
}

export async function connectionContext(params, permission = MANAGE) {
  const ctx = await socialContext(params, permission);
  const { connection, secrets } = await loadProjectConnection(ctx.db, ctx.projectId, ctx.connectionId);
  if (!connection) throw notFound("That account isn't connected to this project.");
  return { ...ctx, connection, secrets };
}

// Workspace tab slug, matching lib/workspace/tabs.js ("Social Accounts" -> "socialaccounts").
const slug = (title) => String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// Redirect back into the workspace after an OAuth round-trip, with the outcome in the query string.
export function backToWorkspace(projectId, tab, params) {
  const path = projectId ? `/project/${projectId}${tab ? `/${slug(tab)}` : ""}` : "/home";
  return NextResponse.redirect(publicUrl(path, params));
}
