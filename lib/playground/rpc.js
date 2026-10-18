// Stand-ins for the definer RPCs the Team & Roles data layer calls
// (lib/supabase/rbac.js), mirroring supabase/migrations/*_rbac_team_access.sql
// over the seeded tables. profiles stands in for auth.users identity.

function isActiveMember(db, projectId, userId) {
  return db
    .table("role_grants")
    .some((g) => g.project_id === projectId && g.user_id === userId && g.status === "active" && g.deleted_at == null);
}

function identity(db, userId) {
  const profile = db.table("profiles").find((p) => p.id === userId);
  const email = profile?.email ?? "";
  return {
    email,
    name: profile?.full_name || email.split("@")[0],
    avatar_url: profile?.avatar_url || null,
  };
}

export const playgroundRpc = {
  rbac_list_members({ db, args, user }) {
    const projectId = args.p_project_id;
    if (!projectId || !isActiveMember(db, projectId, user.id)) return [];
    const roles = new Map(db.table("roles").map((r) => [r.id, r]));
    return db
      .table("role_grants")
      .filter((g) => g.project_id === projectId && g.deleted_at == null && roles.has(g.role_id))
      .map((g) => {
        const role = roles.get(g.role_id);
        return {
          user_id: g.user_id,
          ...identity(db, g.user_id),
          role_id: g.role_id,
          role_key: role.key,
          role_name: role.name,
          status: g.status,
          granted_at: g.created_at,
        };
      })
      .sort((a, b) => roles.get(a.role_id).sort - roles.get(b.role_id).sort || a.email.localeCompare(b.email));
  },

  rbac_org_candidates({ db, args, user }) {
    const projectId = args.p_project_id;
    if (!projectId || !isActiveMember(db, projectId, user.id)) return [];
    const project = db.table("projects").find((p) => p.id === projectId);
    const granted = new Set(
      db.table("role_grants").filter((g) => g.project_id === projectId && g.deleted_at == null).map((g) => g.user_id),
    );
    return db
      .table("organization_users")
      .filter((ou) => ou.organization === project?.organization_id && !granted.has(ou.user))
      .map((ou) => ({ user_id: ou.user, ...identity(db, ou.user), org_role: ou.role }))
      .sort((a, b) => a.email.localeCompare(b.email));
  },

  // The visitor already holds the owner grant; return it like the SQL does.
  rbac_ensure_membership({ db, args, user }) {
    const grant = db
      .table("role_grants")
      .find((g) => g.project_id === args.p_project_id && g.user_id === user.id && g.status === "active" && g.deleted_at == null);
    return { data: grant?.role_id ?? null };
  },
};
