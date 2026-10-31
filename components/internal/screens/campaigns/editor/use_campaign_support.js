"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listLists } from "@/lib/supabase/lists";
import { listSegments } from "@/lib/supabase/segments";
import { getApprovalPolicy, listApprovalRequests } from "@/lib/supabase/approvals";
import { evaluateApproval } from "@/lib/campaigns/approval_rules";
import { estimateCampaign } from "@/lib/campaigns/api";
import { listMembers } from "@/lib/supabase/rbac";

// Lists and segments a campaign audience can include or exclude.
export function useAudienceOptions(projectId) {
  const [state, setState] = useState({ loadedFor: null, lists: [], segments: [] });
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listLists(projectId), listSegments(projectId)]).then(([lists, segments]) => {
      if (alive) setState({ loadedFor: projectId, lists: lists ?? [], segments: segments ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);
  return { loading: state.loadedFor !== projectId, lists: state.lists, segments: state.segments };
}

// The project's approval policy, this campaign's review requests and the evaluated state for the saved campaign.
export function useCampaignApproval(projectId, campaign) {
  const [data, setData] = useState({ key: null, policy: null, requests: [] });
  const campaignId = campaign?.id;
  const key = `${projectId}:${campaignId}`;

  const load = useCallback(async () => {
    const [policy, requests] = await Promise.all([
      getApprovalPolicy(projectId),
      listApprovalRequests(projectId, { campaignId }),
    ]);
    return { key, policy, requests: requests ?? [] };
  }, [projectId, campaignId, key]);

  useEffect(() => {
    if (!projectId || !campaignId) return undefined;
    let alive = true;
    load().then((next) => {
      if (alive) setData(next);
    });
    return () => {
      alive = false;
    };
  }, [load, projectId, campaignId]);

  const refresh = useCallback(async () => setData(await load()), [load]);

  const latest = data.requests[0] || null;
  const state = useMemo(() => evaluateApproval({ policy: data.policy, campaign, request: latest }), [data.policy, campaign, latest]);

  return { loading: data.key !== key, policy: data.policy, requests: data.requests, latest, state, refresh, setRequests: (requests) => setData((d) => ({ ...d, requests })) };
}

// Recipient estimate for the campaign's saved audience; `version` (e.g. updatedAt) refetches after a save.
export function useRecipientEstimate(projectId, campaignId, version) {
  const [result, setResult] = useState({ key: null, data: null, error: null });
  const key = `${projectId}:${campaignId}:${version}`;

  const fetchEstimate = useCallback(async () => {
    const res = await estimateCampaign(projectId, campaignId);
    return { key, data: res.ok ? res.data : null, error: res.ok ? null : res.error };
  }, [projectId, campaignId, key]);

  useEffect(() => {
    if (!projectId || !campaignId) return undefined;
    let alive = true;
    fetchEstimate().then((next) => {
      if (alive) setResult(next);
    });
    return () => {
      alive = false;
    };
  }, [fetchEstimate, projectId, campaignId]);

  const refresh = useCallback(async () => {
    setResult((r) => ({ ...r, key: null }));
    setResult(await fetchEstimate());
  }, [fetchEstimate]);

  return { loading: result.key !== key, data: result.data, error: result.error, refresh };
}

// Project members keyed by user id, for "requested by" / "decided by" names.
export function useMemberNames(projectId) {
  const [state, setState] = useState({ loadedFor: null, members: [] });
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listMembers(projectId).then((rows) => {
      if (alive) setState({ loadedFor: projectId, members: rows ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [projectId]);
  const byId = useMemo(() => new Map(state.members.map((m) => [m.userId, m])), [state.members]);
  const nameOf = useCallback((id) => (id ? byId.get(id)?.name || byId.get(id)?.email || "A teammate" : "—"), [byId]);
  return { members: state.members, byId, nameOf };
}
