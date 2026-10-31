"use client";

import { apiGet, apiPost } from "@/lib/api/client";

// Browser calls to the automation routes (app/api/projects/[projectId]/automations/…). Each returns
// { ok, data, error, status } and never throws; screens own the toasts.

const base = (projectId, automationId) => `/api/projects/${projectId}/automations/${automationId}`;

// -> { id, status, publishedAt }
export const publishAutomation = (projectId, automationId) => apiPost(`${base(projectId, automationId)}/publish`, {});

// -> { id, status }
export const pauseAutomation = (projectId, automationId) => apiPost(`${base(projectId, automationId)}/pause`, {});

// body { contactId, skipWaits } -> { enrollmentId, status, currentNodeId, steps: [{ nodeId, action, status, detail }] }
export const testEnrollContact = (projectId, automationId, body) => apiPost(`${base(projectId, automationId)}/test-enroll`, body);

// -> { totals, current: { nodeId: n }, processed: { nodeId: { ok, failed, skipped } } }
export const getAutomationStats = (projectId, automationId) => apiGet(`${base(projectId, automationId)}/stats`);

// -> { id, status }
export const exitEnrollment = (projectId, automationId, enrollmentId) =>
  apiPost(`${base(projectId, automationId)}/enrollments/${enrollmentId}/exit`, {});
