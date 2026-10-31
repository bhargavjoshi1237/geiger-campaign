"use client";

import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/client";

// Browser calls to the social connect/manage routes. Each returns { ok, data, error, status } and never throws;
// connection rows come back raw (snake_case) — run them through normalizeConnection.

const base = (projectId) => `/api/projects/${projectId}/social`;

export const socialApi = {
  config: (projectId) => apiGet(`${base(projectId)}/config`),
  startMeta: (projectId, { channels, tab }) => apiPost(`${base(projectId)}/meta/start`, { channels, tab }),
  startTikTok: (projectId, { region, tab }) => apiPost(`${base(projectId)}/tiktok/start`, { region, tab }),
  connectTelegram: (projectId, { token, brand }) => apiPost(`${base(projectId)}/telegram`, { token, brand }),
  connectRcs: (projectId, input) => apiPost(`${base(projectId)}/rcs`, input),
  checkAll: (projectId) => apiPost(`${base(projectId)}/health`, {}),
  checkHealth: (projectId, connectionId) => apiPost(`${base(projectId)}/connections/${connectionId}/health`, {}),
  update: (projectId, connectionId, patch) => apiPatch(`${base(projectId)}/connections/${connectionId}`, patch),
  disconnect: (projectId, connectionId) => apiDelete(`${base(projectId)}/connections/${connectionId}`),
  sendTest: (projectId, connectionId, { to, text }) => apiPost(`${base(projectId)}/connections/${connectionId}/test`, { to, text }),
};
