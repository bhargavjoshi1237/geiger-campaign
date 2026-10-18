"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { can as rbacCan, evaluate as rbacEvaluate, resolveGrants } from "@geiger/rbac";

import rbacConfig from "@/geiger-rbac.config";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getUser } from "@/lib/supabase/user";
import {
  ensureMembership,
  ensureSystemRoles,
  listRoles,
  listUserGrants,
} from "@/lib/supabase/rbac";
import {
  usePaintFromShellCache,
  writeShellCache,
} from "@/lib/workspace/shell_cache";

// What the signed-in user may do in the active project: loads (roles, my grants) once per (project, user) and
// exposes explainable decisions. Enforcement is strict once loaded — the safety net is the bootstrap in load(),
// which grants everyone who can reach the project a role before the first decision. This gates UI only; RLS gates data.

// Permissive only while a project switch is in flight, so the shell doesn't flash empty.
const ALLOW_WHILE_LOADING = true;

const UNLOADED = Symbol("rbac:unloaded");

const CACHE = "rbac-grants";

const RbacContext = createContext(null);

const PERMISSIVE = Object.freeze({
  roles: Object.freeze([]),
  grants: Object.freeze([]),
  resolved: null,
  loading: false,
  available: false,
  userId: null,
  isOwner: false,
  hasGrant: true,
  can: () => true,
  decide: () => ({
    allowed: true,
    code: "no_provider",
    reason: "Authorization is not loaded on this surface.",
    via: null,
  }),
  refresh: async () => {},
});

export function RbacProvider({ children }) {
  const { projectId } = useWorkspaceUrl();

  const [userId, setUserId] = useState(null);
  const [roles, setRoles] = useState([]);
  const [grants, setGrants] = useState([]);
  const [loadedFor, setLoadedFor] = useState(UNLOADED);

  usePaintFromShellCache(CACHE, projectId, (entry) => {
    if (!entry.value) return;
    setUserId(entry.userId ?? null);
    setRoles(entry.value.roles || []);
    setGrants(entry.value.grants || []);
    setLoadedFor(projectId);
  });

  const load = useCallback(async () => {
    const user = await getUser();
    const uid = user?.id ?? null;
    if (!projectId || !uid) {
      return { uid, roleRows: [], grantRows: [] };
    }
    let [roleRows, grantRows] = await Promise.all([
      listRoles(projectId),
      listUserGrants(projectId, uid),
    ]);

    // No grant yet: seed the catalog's roles, then let the definer RPC map their org role (it refuses revoked users).
    if (grantRows && grantRows.length === 0) {
      const seeded = await ensureSystemRoles(projectId, uid);
      if (seeded?.length) roleRows = seeded;
      if (await ensureMembership(projectId)) {
        const [freshRoles, freshGrants] = await Promise.all([
          listRoles(projectId),
          listUserGrants(projectId, uid),
        ]);
        roleRows = freshRoles ?? roleRows;
        grantRows = freshGrants ?? grantRows;
      }
    }

    return { uid, roleRows, grantRows };
  }, [projectId]);

  const apply = useCallback(
    ({ uid, roleRows, grantRows }) => {
      setUserId(uid);
      setLoadedFor(projectId);
      if (!roleRows || !grantRows) return;
      setRoles(roleRows);
      setGrants(grantRows);
      if (projectId) {
        writeShellCache(CACHE, projectId, uid, {
          roles: roleRows,
          grants: grantRows,
        });
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let alive = true;
    load().then((result) => {
      if (alive) apply(result);
    });
    return () => {
      alive = false;
    };
  }, [load, apply]);

  const refresh = useCallback(async () => {
    apply(await load());
  }, [load, apply]);

  const loading = loadedFor !== projectId;

  const resolved = useMemo(
    () => resolveGrants({ config: rbacConfig, roles, grants }),
    [roles, grants],
  );

  const value = useMemo(() => {
    // No database configured: nothing to authorize against, so the UI stays reachable (matches the data layer's no-DB mode).
    if (!isSupabaseConfigured()) return { ...PERMISSIVE, refresh };

    const options = { config: rbacConfig, roles, grants, actorId: userId, resolved };
    const activeGrants = grants.filter((g) => g.status === "active");

    const decide = (key, extra = {}) => {
      if (loading) {
        return {
          allowed: ALLOW_WHILE_LOADING,
          code: "loading",
          reason: "Still checking what you can do here.",
          via: null,
        };
      }
      return rbacEvaluate(key, { ...options, ...extra });
    };

    return {
      roles,
      grants,
      resolved,
      loading,
      available: !loading,
      userId,
      isOwner: roles.some(
        (r) =>
          activeGrants.some((g) => g.roleId === r.id) &&
          (r.permissions || []).includes("*"),
      ),
      hasGrant: loading || activeGrants.length > 0,
      can: (key, extra) =>
        loading ? ALLOW_WHILE_LOADING : rbacCan(key, { ...options, ...extra }),
      decide,
      refresh,
    };
  }, [roles, grants, resolved, loading, userId, refresh]);

  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

export function useRbac() {
  return useContext(RbacContext) ?? PERMISSIVE;
}

export function useCan(key, extra) {
  const { can } = useRbac();
  return can(key, extra);
}
