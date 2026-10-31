"use client";

import { apiGet, apiPost } from "@/lib/api/client";

// Browser wrappers for the campaign send routes (implemented by the delivery engine under
// app/api/projects/[projectId]/campaigns/[campaignId]/…). Each returns { ok, data, error, status }.

const path = (projectId, campaignId, action) => `/api/projects/${projectId}/campaigns/${campaignId}/${action}`;

// body: { mode: "now" | "schedule", scheduledAt?, strategy?: { mode: "now" | "scheduled" | "timezone" | "optimized", ... } }
export const sendCampaign = (projectId, campaignId, body) => apiPost(path(projectId, campaignId, "send"), body);

export const sendCampaignTest = (projectId, campaignId, to) => apiPost(path(projectId, campaignId, "test"), { to });

export const cancelCampaign = (projectId, campaignId) => apiPost(path(projectId, campaignId, "cancel"), {});

// { recipients, excluded: { unsubscribed, suppressed, noAddress, noConsent } } for the saved audience.
export const estimateCampaign = (projectId, campaignId, opts) => apiGet(path(projectId, campaignId, "estimate"), opts);

// { metrics, links, timeline, variants }
export const getCampaignReport = (projectId, campaignId, opts) => apiGet(path(projectId, campaignId, "report"), opts);
