// Reporting seed: Halcyon Studio's saved dashboards and custom reports (campaign.dashboards,
// campaign.reports) as raw snake_case rows. Widgets and reports only hold definitions — every number
// on screen is computed from the seeded campaigns, deliveries and tracked events.

import { personId } from "../cast.js";
import { PROJECT_ID, daysAgo, hoursAgo, seedIds } from "./helpers.js";

const aid = seedIds({ dashboard: 1100, report: 1101 });

const widget = (id, type, metric, dimension, size, range = "dashboard") => ({ id, widget: type, metric, dimension, range, size, title: "" });

const dashboard = (n, { name, description, range, shared = true, isDefault = false, owner, created, updated, layout }) => ({
  id: aid("dashboard", n),
  project_id: PROJECT_ID,
  name,
  description,
  layout,
  range,
  is_default: isDefault,
  shared,
  metadata: {},
  created_by: personId(owner),
  created_at: daysAgo(created),
  updated_at: daysAgo(updated),
  deleted_at: null,
});

const MAYA = ["maya@halcyon.studio"];
const LEADS = ["alex@halcyon.studio", "maya@halcyon.studio", "priya@halcyon.studio"];

const report = (n, { name, description, definition, schedule, owner, created, lastRun, runs = [] }) => ({
  id: aid("report", n),
  project_id: PROJECT_ID,
  name,
  description,
  definition: { filters: { channels: [], campaignIds: [], listIds: [] }, limit: 10, ...definition },
  schedule: { frequency: "manual", hour: 9, weekday: 0, day: 1, timezone: "Europe/Lisbon", recipients: [], ...schedule },
  last_run_at: lastRun,
  metadata: { runs },
  created_by: personId(owner),
  created_at: daysAgo(created),
  updated_at: daysAgo(Math.max(0, created - 3)),
  deleted_at: null,
});

const scheduledRuns = (count, everyDays, rows, sentTo, startHours = 20) =>
  Array.from({ length: count }, (_, i) => ({ at: hoursAgo(startHours + i * everyDays * 24), trigger: "schedule", rows, sentTo }));

export function reportingSeed() {
  return {
    dashboards: [
      dashboard(1, {
        name: "Campaign overview",
        description: "Top-line volume, engagement and revenue across every campaign.",
        range: "30d",
        isDefault: true,
        owner: 2,
        created: 140,
        updated: 6,
        layout: [
          widget("w1", "kpi", "sends", "none", "sm"),
          widget("w2", "kpi", "open_rate", "none", "sm"),
          widget("w3", "kpi", "click_rate", "none", "sm"),
          widget("w4", "kpi", "revenue", "none", "sm"),
          widget("w5", "timeseries", "sends", "time", "md"),
          widget("w6", "bar", "revenue", "campaign", "md"),
        ],
      }),
      dashboard(2, {
        name: "Email performance",
        description: "Engagement for email sends, by mailbox provider and campaign.",
        range: "30d",
        owner: 10,
        created: 96,
        updated: 9,
        layout: [
          widget("w1", "kpi", "delivered", "none", "sm"),
          widget("w2", "kpi", "open_rate", "none", "sm"),
          widget("w3", "kpi", "click_rate", "none", "sm"),
          widget("w4", "kpi", "unsubscribe_rate", "none", "sm"),
          widget("w5", "timeseries", "open_rate", "time", "md"),
          widget("w6", "bar", "open_rate", "provider", "md"),
          widget("w7", "table", "click_rate", "campaign", "full"),
        ],
      }),
      dashboard(3, {
        name: "Revenue",
        description: "Attributed revenue by channel and campaign — my working view.",
        range: "90d",
        shared: false,
        owner: 1,
        created: 61,
        updated: 2,
        layout: [
          widget("w1", "kpi", "revenue", "none", "sm"),
          widget("w2", "kpi", "conversions", "none", "sm"),
          widget("w3", "kpi", "revenue_per_recipient", "none", "sm"),
          widget("w4", "kpi", "total_revenue", "none", "sm"),
          widget("w5", "timeseries", "revenue", "week", "md"),
          widget("w6", "bar", "revenue", "channel", "md"),
          widget("w7", "table", "revenue", "campaign", "full"),
        ],
      }),
      dashboard(4, {
        name: "Weekly exec summary",
        description: "The numbers leadership reviews every Monday.",
        range: "7d",
        owner: 4,
        created: 44,
        updated: 12,
        layout: [
          widget("w1", "kpi", "sends", "none", "sm"),
          widget("w2", "kpi", "click_rate", "none", "sm"),
          widget("w3", "kpi", "revenue", "none", "sm"),
          widget("w4", "kpi", "new_contacts", "none", "sm"),
          widget("w5", "bar", "click_rate", "weekday", "full", "90d"),
        ],
      }),
    ],
    reports: [
      report(1, {
        name: "Weekly performance summary",
        description: "Open rate for every campaign sent in the last 30 days.",
        definition: { metric: "open_rate", dimension: "campaign", chart: "table", range: "30d" },
        schedule: { frequency: "weekly", weekday: 0, hour: 9, recipients: LEADS },
        owner: 2,
        created: 120,
        lastRun: hoursAgo(20),
        runs: scheduledRuns(4, 7, 6, LEADS),
      }),
      report(2, {
        name: "Daily deliverability digest",
        description: "Bounce rate by recipient domain for the last week.",
        definition: { metric: "bounce_rate", dimension: "domain", chart: "table", range: "7d" },
        schedule: { frequency: "daily", hour: 8, recipients: MAYA },
        owner: 2,
        created: 80,
        lastRun: hoursAgo(9),
        runs: scheduledRuns(6, 1, 8, MAYA, 9),
      }),
      report(3, {
        name: "Revenue attribution by channel",
        description: "Last-click attributed revenue per channel, quarter to date.",
        definition: { metric: "revenue", dimension: "channel", chart: "bar", range: "90d" },
        schedule: { frequency: "monthly", day: 1, hour: 10, recipients: ["alex@halcyon.studio", "hana@halcyon.studio"] },
        owner: 1,
        created: 75,
        lastRun: daysAgo(26),
        runs: [{ at: daysAgo(26), trigger: "schedule", rows: 3, sentTo: ["alex@halcyon.studio", "hana@halcyon.studio"] }],
      }),
      report(4, {
        name: "Click rate by list",
        description: "How each audience list responds to what we send.",
        definition: { metric: "click_rate", dimension: "list", chart: "bar", range: "90d" },
        schedule: { frequency: "manual" },
        owner: 10,
        created: 33,
        lastRun: daysAgo(5),
        runs: [{ at: daysAgo(5), trigger: "manual", rows: 4 }],
      }),
      report(5, {
        name: "Weekly sends",
        description: "Messages sent per week across every channel.",
        definition: { metric: "sends", dimension: "week", chart: "bar", range: "90d" },
        schedule: { frequency: "manual" },
        owner: 4,
        created: 21,
        lastRun: null,
      }),
      report(6, {
        name: "Executive overview",
        description: "Attributed revenue for the month, compared with the month before.",
        definition: { metric: "revenue", dimension: "none", chart: "kpi", range: "30d" },
        schedule: { frequency: "monthly", day: 1, hour: 9, recipients: LEADS },
        owner: 1,
        created: 58,
        lastRun: daysAgo(26),
        runs: [{ at: daysAgo(26), trigger: "schedule", rows: 1, sentTo: LEADS }],
      }),
    ],
  };
}
