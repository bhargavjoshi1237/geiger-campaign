"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useProject } from "@/context/project-context";
import { listCampaigns } from "@/lib/supabase/campaigns";
import { loadContacts, loadDeliveries, loadListsWithMembers, loadReportEvents, loadSegments } from "@/lib/supabase/report_sources";
import { DEFAULT_CONVERSION_EVENTS } from "@/lib/reporting/attribution";
import { loadSince } from "@/lib/reporting/ranges";

const ALL = ["campaigns", "deliveries", "events", "contacts", "lists", "segments"];

// Loads the rows a reporting screen aggregates for `range` (plus the previous period and `lookbackDays`).
// `loading` is true until the current request lands; previous rows stay visible meanwhile.
// `failed` is true when any requested source couldn't be read.
export function useReportSources({ range = "30d", lookbackDays = 0, include = ALL, eventNames = DEFAULT_CONVERSION_EVENTS } = {}) {
  const { projectId } = useProject();
  const [state, setState] = useState({ key: null, failed: false, truncated: false, sources: null, loadedAt: null });
  const [token, setToken] = useState(0);
  const since = useMemo(() => loadSince(range, { lookbackDays }), [range, lookbackDays]);
  const includeKey = include.join(",");
  const namesKey = eventNames.join(",");
  const requestKey = `${projectId}|${since}|${includeKey}|${namesKey}|${token}`;

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    const wants = new Set(includeKey.split(","));
    const skip = Promise.resolve(undefined);
    Promise.all([
      wants.has("campaigns") ? listCampaigns(projectId) : skip,
      wants.has("deliveries") ? loadDeliveries(projectId, { since }) : skip,
      wants.has("events") ? loadReportEvents(projectId, { since, names: namesKey ? namesKey.split(",") : [] }) : skip,
      wants.has("contacts") ? loadContacts(projectId) : skip,
      wants.has("lists") ? loadListsWithMembers(projectId) : skip,
      wants.has("segments") ? loadSegments(projectId) : skip,
    ]).then(([campaigns, deliveries, events, contacts, lists, segments]) => {
      if (!alive) return;
      const results = [campaigns, deliveries, events, contacts, lists, segments];
      setState({
        key: requestKey,
        failed: results.some((r) => r === null),
        truncated: Boolean(deliveries?.truncated || events?.truncated || contacts?.truncated || lists?.truncated),
        loadedAt: new Date(),
        sources: {
          campaigns: campaigns || [],
          deliveries: deliveries?.rows || [],
          events: events?.rows || [],
          contacts: contacts?.rows || [],
          lists: lists?.lists || [],
          listMembers: lists?.members || [],
          segments: segments || [],
        },
      });
    });
    return () => {
      alive = false;
    };
  }, [projectId, since, includeKey, namesKey, requestKey]);

  const reload = useCallback(() => setToken((t) => t + 1), []);
  return {
    loading: state.key !== requestKey,
    failed: state.failed,
    truncated: state.truncated,
    sources: state.sources,
    loadedAt: state.loadedAt,
    reload,
    projectId,
  };
}
