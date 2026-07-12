"use client";

import { useCallback } from "react";
import {
  useRouter,
  usePathname,
  useSearchParams,
  useParams,
} from "next/navigation";
import { tabToSlug, slugToTab } from "@/lib/workspace/tabs";

// Persistent workspace navigation, mirrored to the URL so a refresh (or a shared
// link) lands the user on the exact same place — the active project, sidebar
// tab, and any open record. Matches the suite pattern (Geiger Events / Flow): the
// project and tab live in the PATH, transient per-record selection stays in the
// query string.
//
// Schema:  /project/<uuid>/<tabSlug>?record=rec_123&section=details
//   - <uuid>    → active project (public.projects). Scopes all data.
//   - <tabSlug> → sidebar tab, lowercased with no spaces/caps
//                 ("All Campaigns" -> "allcampaigns"). The default tab (Overview)
//                 is omitted, so a bare /project/<uuid> is the Overview.
//   - record    → id of the open record in a list screen. None ⇒ omitted.
//   - section   → editor section inside a record. Default "overview" ⇒ omitted.
//
// Components reading this hook must sit under a <Suspense> boundary (required by
// `useSearchParams`); the project shell provides one.
export const DEFAULT_TAB = "Overview";
export const DEFAULT_SECTION = "overview";

export function useWorkspaceUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = params?.projectId || null;
  // The catch-all segment after the project id ([[...rest]]); rest[0] is the tab.
  const rest = params?.rest;
  const tabSlug = Array.isArray(rest) ? rest[0] : rest || null;
  const tab = (tabSlug && slugToTab(tabSlug)) || DEFAULT_TAB;

  const recordId = searchParams.get("record") || null;
  const section = searchParams.get("section") || DEFAULT_SECTION;

  // Build the next URL from a partial patch. For each key: `undefined` keeps the
  // current value; an explicit value (incl. null) replaces it. Defaults and
  // empties drop from the URL so it stays clean.
  const buildUrl = useCallback(
    (next) => {
      const pid = next.project !== undefined ? next.project : projectId;
      if (!pid) return pathname; // no active project — nothing to navigate to
      const nextTab = next.tab !== undefined ? next.tab : tab;
      const slug = nextTab && nextTab !== DEFAULT_TAB ? tabToSlug(nextTab) : "";
      let path = `/project/${pid}`;
      if (slug) path += `/${slug}`;

      const qp = new URLSearchParams();
      const rc = next.record !== undefined ? next.record : recordId;
      const sec = next.section !== undefined ? next.section : section;
      if (rc) qp.set("record", rc);
      if (sec && sec !== DEFAULT_SECTION) qp.set("section", sec);

      const qs = qp.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [projectId, tab, recordId, section, pathname],
  );

  const apply = useCallback(
    (next) => router.push(buildUrl(next), { scroll: false }),
    [router, buildUrl],
  );

  // Switching the active project resets any open record/section (their ids
  // belong to the previous project); the sidebar tab is kept.
  const setProject = useCallback(
    (id) => apply({ project: id, record: null, section: null }),
    [apply],
  );
  // Switching workspace tabs exits any open record/section.
  const setTab = useCallback(
    (next) => apply({ tab: next, record: null, section: null }),
    [apply],
  );
  // Opening a record keeps the tab but resets to its default section.
  const openRecord = useCallback(
    (id) => apply({ record: id, section: null }),
    [apply],
  );
  // Switch to another tab and open a record there in one navigation.
  const openRecordInTab = useCallback(
    (id, nextTab) => apply({ tab: nextTab, record: id, section: null }),
    [apply],
  );
  const closeRecord = useCallback(
    () => apply({ record: null, section: null }),
    [apply],
  );
  const setSection = useCallback((next) => apply({ section: next }), [apply]);

  return {
    projectId,
    tab,
    recordId,
    section,
    setProject,
    setTab,
    openRecord,
    openRecordInTab,
    closeRecord,
    setSection,
  };
}
