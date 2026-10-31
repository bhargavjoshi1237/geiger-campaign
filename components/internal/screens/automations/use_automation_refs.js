"use client";

import { useEffect, useMemo, useState } from "react";

import { listLists } from "@/lib/supabase/lists";
import { listCampaigns } from "@/lib/supabase/campaigns";
import { listConnections } from "@/lib/supabase/channel_connections";
import { listCustomFields } from "@/lib/supabase/custom_fields";
import { listTags } from "@/lib/supabase/tags";
import { listMembers } from "@/lib/supabase/rbac";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { listConditionSets, listGoals } from "@/lib/supabase/automation_library";
import { CATALOG_EVENT_NAMES } from "@/lib/automations/triggers";
import { useRuleFields } from "./rule_builder";

const EMPTY = {
  loaded: false,
  loadedAt: 0,
  lists: [],
  campaigns: [],
  connections: [],
  customFields: [],
  tags: [],
  members: [],
  conditionSets: [],
  goals: [],
  recentEvents: [],
};

// Everything the builder's pickers and summaries reference, loaded once per project.
export function useAutomationRefs(projectId) {
  const [state, setState] = useState(EMPTY);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    Promise.all([
      listLists(projectId),
      listCampaigns(projectId),
      listConnections(projectId),
      listCustomFields(projectId),
      listTags(projectId),
      listMembers(projectId),
      listConditionSets(projectId),
      listGoals(projectId),
      listTrackedEvents(projectId, { since, limit: 2000 }),
    ]).then(([lists, campaigns, connections, customFields, tags, members, conditionSets, goals, recentEvents]) => {
      if (!alive) return;
      setState({
        loaded: true,
        loadedAt: Date.now(),
        lists: lists ?? [],
        campaigns: campaigns ?? [],
        connections: connections ?? [],
        customFields: customFields ?? [],
        tags: tags ?? [],
        members: members ?? [],
        conditionSets: conditionSets ?? [],
        goals: goals ?? [],
        recentEvents: recentEvents ?? [],
      });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const ruleFields = useRuleFields({ lists: state.lists, customFields: state.customFields, tags: state.tags });

  return useMemo(() => {
    const eventNames = [...new Set([...CATALOG_EVENT_NAMES, ...state.recentEvents.map((e) => e.name)])].filter(Boolean);
    return { ...state, ruleFields, eventNames };
  }, [state, ruleFields]);
}
