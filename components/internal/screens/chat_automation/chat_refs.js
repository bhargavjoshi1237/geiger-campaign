"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/context/project-context";
import { listDmFlows } from "@/lib/supabase/dm_flows";
import { listChatSequences } from "@/lib/supabase/chat_sequences";
import { listAiAgents } from "@/lib/supabase/ai_agents";
import { listChatAutomations } from "@/lib/supabase/chat_automations";
import { listMembers } from "@/lib/supabase/rbac";

// Lookups the chat editors pick from (flows, sequences, agents, automations, teammates), loaded once per screen.
const LOADERS = {
  flows: (projectId) => listDmFlows(projectId),
  sequences: (projectId) => listChatSequences(projectId),
  agents: (projectId) => listAiAgents(projectId),
  automations: (projectId) => listChatAutomations(projectId),
  members: (projectId) => listMembers(projectId),
};

export function useChatRefs(keys = []) {
  const { projectId } = useProject();
  const signature = keys.join(",");
  const [refs, setRefs] = useState({ loaded: false });
  useEffect(() => {
    let alive = true;
    const wanted = signature ? signature.split(",") : [];
    Promise.all(wanted.map((k) => (LOADERS[k] ? LOADERS[k](projectId) : Promise.resolve([])))).then((results) => {
      if (!alive) return;
      const next = { loaded: true };
      wanted.forEach((k, i) => {
        next[k] = (results[i] ?? []).filter((r) => r.status !== "archived");
      });
      setRefs(next);
    });
    return () => {
      alive = false;
    };
  }, [projectId, signature]);
  return refs;
}

export const nameOf = (rows = [], id, fallback = "—") => (id ? rows.find((r) => r.id === id || r.userId === id)?.name || fallback : fallback);
