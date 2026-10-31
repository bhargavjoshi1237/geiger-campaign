"use client";

import { apiGet, apiPost } from "@/lib/api/client";

// Browser calls to the chat routes (publish / pause, flow simulator, AI sandbox, knowledge refresh, live
// posts). Each returns the lib/api/client shape { ok, data, error, status } — the screen owns the toast.

const base = (projectId) => `/api/projects/${projectId}/chat`;

// resource: automations | flows | sequences | agents | entry_points | handover_rules; action: publish | pause | archive.
export function setChatStatus(projectId, resource, id, action) {
  return apiPost(`${base(projectId)}/status`, { resource, id, action });
}

export function simulateFlow(projectId, flowId, body) {
  return apiPost(`${base(projectId)}/flows/${flowId}/simulate`, body);
}

// -> { configured, model } (whether CAMPAIGN_LLM_* is set on the server).
export function getChatAiStatus(projectId) {
  return apiGet(`${base(projectId)}/ai`);
}

export function testAgent(projectId, agentId, body) {
  return apiPost(`${base(projectId)}/agents/${agentId}/test`, body);
}

export function refreshAgentKnowledge(projectId, agentId, knowledge) {
  return apiPost(`${base(projectId)}/agents/${agentId}/knowledge`, { knowledge });
}

export function listConnectionPosts(projectId, connectionId, kind = "posts") {
  return apiGet(`${base(projectId)}/posts?connectionId=${encodeURIComponent(connectionId)}&kind=${kind}`);
}

// The tracked redirect a QR code / shared link points at (counts the scan, then opens the deep link).
export function entryRedirectUrl(entryId, via = "link") {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api/public/chat/entry/${entryId}${via === "qr" ? "?via=qr" : ""}`;
}
