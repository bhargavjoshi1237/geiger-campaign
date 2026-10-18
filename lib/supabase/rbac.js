"use client";

import {
  isSupabaseConfigured,
  publicClient,
  schemaClient,
} from "@/supabase/components/campaign-client";
import rbacConfig from "@/geiger-rbac.config";
import { isProductKey } from "@/lib/rbac";

// Data layer for authorization: public.roles (shared suite-wide) and campaign.role_grants (this product's assignments).
// Pure: console.error on failure and return null / false / [] — never throw, never toast. snake_case ↔ camelCase here.

const ROLES_TABLE = "roles";
const GRANTS_TABLE = "role_grants";

export function normalizeRole(row) {
  if (!row) return null;
  const meta =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...meta,
    id: row.id,
    projectId: row.project_id ?? null,
    key: row.key ?? meta.key ?? null,
    name: row.name ?? "",
    description: row.description ?? "",
    color: row.color ?? "slate",
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
    isSystem: row.is_system ?? false,
    sort: row.sort ?? 0,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function normalizeGrant(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    userId: row.user_id ?? null,
    roleId: row.role_id ?? null,
    scope: row.scope && typeof row.scope === "object" ? row.scope : {},
    status: row.status ?? "active",
    grantedBy: row.granted_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

function normalizeMember(row) {
  return {
    userId: row.user_id,
    email: row.email ?? "",
    name: row.name ?? "",
    avatarUrl: row.avatar_url ?? "",
    roleId: row.role_id ?? null,
    roleKey: row.role_key ?? null,
    roleName: row.role_name ?? "",
    status: row.status ?? "active",
    grantedAt: row.granted_at ?? null,
    orgRole: row.org_role ?? null,
  };
}

function roleToRow(input) {
  const row = {};
  const map = {
    projectId: "project_id",
    key: "key",
    name: "name",
    description: "description",
    color: "color",
    isSystem: "is_system",
    sort: "sort",
    createdBy: "created_by",
  };
  for (const [key, col] of Object.entries(map)) {
    if (key in input) row[col] = input[key];
  }
  if ("permissions" in input) {
    row.permissions = Array.isArray(input.permissions) ? input.permissions : [];
  }
  return row;
}

// --- Roles -----------------------------------------------------------------

export async function listRoles(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await publicClient()
      .from(ROLES_TABLE)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("is_system", { ascending: false })
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[rbac.listRoles]", error.message);
      return null;
    }
    return (data || []).map(normalizeRole);
  } catch (e) {
    console.error("[rbac.listRoles]", e);
    return null;
  }
}

export async function createRole(input) {
  if (!isSupabaseConfigured()) return null;
  try {
    const payload = roleToRow(input);
    if (input.id) payload.id = input.id;
    const { data, error } = await publicClient()
      .from(ROLES_TABLE)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      console.error("[rbac.createRole]", error.message);
      return null;
    }
    return normalizeRole(data);
  } catch (e) {
    console.error("[rbac.createRole]", e);
    return null;
  }
}

export async function updateRole(id, patch) {
  if (!id || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await publicClient()
      .from(ROLES_TABLE)
      .update(roleToRow(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      console.error("[rbac.updateRole]", error.message);
      return null;
    }
    return normalizeRole(data);
  } catch (e) {
    console.error("[rbac.updateRole]", e);
    return null;
  }
}

export async function softDeleteRole(id) {
  if (!id || !isSupabaseConfigured()) return false;
  try {
    const { error } = await publicClient()
      .from(ROLES_TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[rbac.softDeleteRole]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[rbac.softDeleteRole]", e);
    return false;
  }
}

// Seed the catalog's system roles into a project; idempotent, safe on every load.
// Roles are shared, so a system role another product seeded first gets this catalog's defaults merged in once —
// only while it holds no campaign.* key, so a deliberate edit to Campaign's half is never re-applied.
export async function ensureSystemRoles(projectId, createdBy = null) {
  if (!projectId || !isSupabaseConfigured()) return [];
  try {
    const existing = await listRoles(projectId);
    if (existing === null) return [];
    const byKey = new Map(existing.filter((r) => r.key).map((r) => [r.key, r]));

    const missing = rbacConfig.systemRoles.filter((r) => !byKey.has(r.key));
    const unseeded = rbacConfig.systemRoles
      .map((seed) => ({ seed, role: byKey.get(seed.key) }))
      .filter(
        ({ role }) =>
          role?.isSystem &&
          !role.permissions.includes("*") &&
          !role.permissions.some(isProductKey),
      );
    if (missing.length === 0 && unseeded.length === 0) return existing;

    if (missing.length) {
      const { error } = await publicClient()
        .from(ROLES_TABLE)
        .insert(
          missing.map((role) => ({
            project_id: projectId,
            key: role.key,
            name: role.name,
            description: role.description,
            color: role.color,
            permissions: [...role.permissions],
            is_system: true,
            sort: role.sort,
            created_by: createdBy,
            metadata: { key: role.key },
          })),
        );
      if (error) console.error("[rbac.ensureSystemRoles]", error.message);
    }

    for (const { seed, role } of unseeded) {
      const permissions = Array.from(new Set([...role.permissions, ...seed.permissions]));
      await updateRole(role.id, { permissions });
    }

    return (await listRoles(projectId)) ?? existing;
  } catch (e) {
    console.error("[rbac.ensureSystemRoles]", e);
    return [];
  }
}

// --- Grants ----------------------------------------------------------------

// One user's grants — what the provider resolves decisions against.
export async function listUserGrants(projectId, userId) {
  if (!projectId || !userId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient()
      .from(GRANTS_TABLE)
      .select("*")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (error) {
      console.error("[rbac.listUserGrants]", error.message);
      return null;
    }
    return (data || []).map(normalizeGrant);
  } catch (e) {
    console.error("[rbac.listUserGrants]", e);
    return null;
  }
}

// Give the signed-in user their role in this project if they have never held one (org role → campaign role, in SQL).
export async function ensureMembership(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("rbac_ensure_membership", {
      p_project_id: projectId,
      p_default_role: null,
    });
    if (error) {
      console.error("[rbac.ensureMembership]", error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error("[rbac.ensureMembership]", e);
    return null;
  }
}

// Project roster: grants joined to identity (auth.users is only readable through the definer RPC).
export async function listMembers(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("rbac_list_members", {
      p_project_id: projectId,
    });
    if (error) {
      console.error("[rbac.listMembers]", error.message);
      return null;
    }
    return (data || []).map(normalizeMember);
  } catch (e) {
    console.error("[rbac.listMembers]", e);
    return null;
  }
}

// Organization members who hold no grant in this project yet — the "add member" picker.
export async function listOrgCandidates(projectId) {
  if (!projectId || !isSupabaseConfigured()) return null;
  try {
    const { data, error } = await schemaClient().rpc("rbac_org_candidates", {
      p_project_id: projectId,
    });
    if (error) {
      console.error("[rbac.listOrgCandidates]", error.message);
      return null;
    }
    return (data || []).map(normalizeMember);
  } catch (e) {
    console.error("[rbac.listOrgCandidates]", e);
    return null;
  }
}

// Assign a role, reviving a previously revoked (project, user, role) row rather than tripping the partial unique index.
export async function grantRole({ projectId, userId, roleId, scope = {}, grantedBy = null }) {
  if (!projectId || !userId || !roleId || !isSupabaseConfigured()) return null;
  try {
    const sb = schemaClient();
    const { data: existing } = await sb
      .from(GRANTS_TABLE)
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("role_id", roleId)
      .limit(1)
      .maybeSingle();

    const payload = {
      project_id: projectId,
      user_id: userId,
      role_id: roleId,
      scope: scope || {},
      status: "active",
      granted_by: grantedBy,
      deleted_at: null,
    };

    const query = existing?.id
      ? sb.from(GRANTS_TABLE).update(payload).eq("id", existing.id)
      : sb.from(GRANTS_TABLE).insert(payload);

    const { data, error } = await query.select("*").single();
    if (error) {
      console.error("[rbac.grantRole]", error.message);
      return null;
    }
    return normalizeGrant(data);
  } catch (e) {
    console.error("[rbac.grantRole]", e);
    return null;
  }
}

// Revoke every grant a user holds in the project (removes them from the workspace).
export async function revokeMember(projectId, userId) {
  if (!projectId || !userId || !isSupabaseConfigured()) return false;
  try {
    const { error } = await schemaClient()
      .from(GRANTS_TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (error) {
      console.error("[rbac.revokeMember]", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[rbac.revokeMember]", e);
    return false;
  }
}

// Replace a member's role: grant the new one, then revoke the rest (grant first so a failure never strands them).
export async function setMemberRole({ projectId, userId, roleId, grantedBy = null }) {
  if (!projectId || !userId || !roleId || !isSupabaseConfigured()) return null;
  const granted = await grantRole({ projectId, userId, roleId, grantedBy });
  if (!granted) return null;
  try {
    const { error } = await schemaClient()
      .from(GRANTS_TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .neq("role_id", roleId)
      .is("deleted_at", null);
    if (error) console.error("[rbac.setMemberRole]", error.message);
  } catch (e) {
    console.error("[rbac.setMemberRole]", e);
  }
  return granted;
}
