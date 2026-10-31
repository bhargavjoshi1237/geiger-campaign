// CRM seed: Halcyon Studio's own new-business and retainer pipelines — the suite's client roster as
// companies, deals at every stage, the stage history the deals trigger would have written, follow-up
// tasks, logged calls/meetings/notes, and one deal_won tracked event per won deal (n 9000+).
// Raw snake_case rows, exactly what Supabase returns.

import { PROJECT_ID, dateOnly, daysAgo, daysFromNow, hoursAgo, seedIds } from "./helpers.js";
import { CLIENTS, personId } from "../cast.js";

const aid = seedIds({ company: 800, pipeline: 801, deal: 802, crm_task: 803, crm_activity: 804 });

const row = (id, created, extra) => ({
  id,
  project_id: PROJECT_ID,
  metadata: {},
  created_by: personId(1),
  created_at: created,
  updated_at: created,
  deleted_at: null,
  ...extra,
});

// Companies: the cast's clients plus four prospects.
const PROSPECTS = [
  { key: "brightline", name: "Brightline Rail", industry: "Mobility", city: "Chicago", domain: "brightline-rail.example" },
  { key: "pinecrest", name: "Pinecrest Schools", industry: "Education", city: "Denver", domain: "pinecrest.example" },
  { key: "harbor", name: "Harbor & Vine", industry: "Hospitality", city: "Porto", domain: "harborvine.example" },
  { key: "quanta", name: "Quanta Labs", industry: "Software", city: "Berlin", domain: "quantalabs.example" },
];

const COMPANY_SPECS = [
  ...CLIENTS.map((c) => ({ key: c.key, name: c.name, industry: c.industry, city: c.city, domain: c.email.split("@")[1] })),
  ...PROSPECTS,
];

const SIZE = { northwind: "201–500", atlas: "51–200", lumen: "1000+", kestrel: "51–200", solace: "501–1000", orbit: "201–500", fernway: "1000+", meridian: "1000+", brightline: "1000+", pinecrest: "201–500", harbor: "11–50", quanta: "11–50" };
const COMPANY_OWNER = { northwind: 1, atlas: 2, lumen: 10, kestrel: 1, solace: 6, orbit: 8, fernway: 10, meridian: 2, brightline: 8, pinecrest: 6, harbor: 3, quanta: 10 };

const companyN = (key) => COMPANY_SPECS.findIndex((c) => c.key === key) + 1;

function companies() {
  return COMPANY_SPECS.map((c, i) =>
    row(aid("company", i + 1), daysAgo(320 - i * 21), {
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      size: SIZE[c.key],
      owner_id: personId(COMPANY_OWNER[c.key]),
      website: `https://${c.domain}`,
      address: c.city,
      auto_associate: true,
      attributes: {},
    }),
  );
}

// Pipelines ---------------------------------------------------------------------

const NEW_BUSINESS = [
  { id: "stg_nb_lead", name: "Lead", probability: 10, color: "neutral" },
  { id: "stg_nb_qualified", name: "Qualified", probability: 25, color: "blue" },
  { id: "stg_nb_proposal", name: "Proposal", probability: 50, color: "violet" },
  { id: "stg_nb_negotiation", name: "Negotiation", probability: 75, color: "amber" },
];

const RETAINERS = [
  { id: "stg_rt_due", name: "Renewal due", probability: 40, color: "blue" },
  { id: "stg_rt_scoping", name: "Scoping", probability: 60, color: "violet" },
  { id: "stg_rt_contract", name: "Contract sent", probability: 85, color: "emerald" },
];

const PIPELINES = [
  { n: 1, name: "New business", description: "Brand, campaign and event work from new and returning clients.", stages: NEW_BUSINESS, is_default: true, created: 300 },
  { n: 2, name: "Retainers & renewals", description: "Ongoing retainers coming up for renewal or expansion.", stages: RETAINERS, is_default: false, created: 210 },
];

function pipelines() {
  return PIPELINES.map((p) =>
    row(aid("pipeline", p.n), daysAgo(p.created), { name: p.name, description: p.description, stages: p.stages, is_default: p.is_default }),
  );
}

// Deals -------------------------------------------------------------------------
// [n, pipeline, stageIndex, status, name, company, contact n, owner n, value, currency, created days ago,
//  close (days from now for open; days ago for won/lost), source campaign n | null, lost reason]
const DEALS = [
  [1, 1, 3, "open", "Kestrel Aero launch — phase two", "kestrel", 4, 1, 86000, "EUR", 46, 9, 3, ""],
  [2, 1, 2, "open", "Atlas café rollout toolkit", "atlas", 2, 2, 42000, "EUR", 34, 21, null, ""],
  [3, 1, 2, "open", "Lumen patient app launch film", "lumen", 3, 10, 58000, "USD", 29, 18, 5, ""],
  [4, 1, 1, "open", "Brightline station wayfinding", "brightline", 21, 8, 120000, "USD", 17, 45, null, ""],
  [5, 1, 0, "open", "Pinecrest enrolment campaign", "pinecrest", 22, 6, 24000, "USD", 6, 60, 7, ""],
  [6, 1, 0, "open", "Quanta Labs brand sprint", "quanta", 24, 10, 18500, "EUR", 3, 40, null, ""],
  [7, 1, 1, "open", "Harbor & Vine menu + identity", "harbor", 23, 3, 9500, "EUR", 12, 25, null, ""],
  [8, 1, 3, "open", "Orbit Audio holiday campaign", "orbit", 6, 8, 64000, "EUR", 38, -2, 1, ""],
  [9, 1, 2, "open", "Fernway own-label packaging", "fernway", 7, 10, 73000, "USD", 25, 30, null, ""],
  [10, 1, 1, "open", "Meridian annual report design", "meridian", 8, 2, 36000, "USD", 14, 35, 2, ""],
  [11, 1, 3, "won", "Solace Summer '26 campaign", "solace", 5, 6, 92000, "EUR", 96, 41, 4, ""],
  [12, 1, 3, "won", "Northwind trail series content", "northwind", 1, 1, 54000, "USD", 74, 22, 6, ""],
  [13, 1, 2, "won", "Atlas packaging system", "atlas", 2, 2, 38000, "EUR", 120, 63, null, ""],
  [14, 1, 3, "won", "Kestrel Aero launch event", "kestrel", 4, 1, 47000, "EUR", 58, 12, 8, ""],
  [15, 1, 1, "lost", "Lumen clinic signage refresh", "lumen", 3, 10, 21000, "USD", 64, 30, null, "Went with a competitor — chose their in-house team"],
  [16, 1, 2, "lost", "Meridian onboarding video", "meridian", 8, 2, 28000, "USD", 51, 16, null, "No budget — frozen until next fiscal year"],
  [17, 1, 0, "lost", "Brightline social retainer", "brightline", 21, 8, 15000, "USD", 33, 9, null, "No decision / went quiet"],
  [18, 2, 0, "open", "Northwind 2027 retainer", "northwind", 1, 1, 144000, "USD", 20, 50, null, ""],
  [19, 2, 1, "open", "Solace always-on social", "solace", 5, 6, 66000, "EUR", 27, 28, null, ""],
  [20, 2, 2, "open", "Orbit product photography retainer", "orbit", 6, 8, 39000, "EUR", 31, 6, null, ""],
  [21, 2, 2, "won", "Fernway in-store retainer renewal", "fernway", 7, 10, 81000, "USD", 88, 36, null, ""],
  [22, 2, 1, "lost", "Atlas social retainer", "atlas", 2, 2, 22000, "EUR", 70, 44, null, "Price — moved social in-house"],
];

const stagesOf = (pipeline) => (pipeline === 1 ? NEW_BUSINESS : RETAINERS);

function dealRows() {
  return DEALS.map(([n, pipeline, stage, status, name, company, contact, owner, value, currency, created, close, campaign, reason]) => {
    const createdAt = daysAgo(created, 3);
    const closedAt = status === "open" ? null : daysAgo(close, 5);
    return row(aid("deal", n), createdAt, {
      updated_at: closedAt || daysAgo(Math.max(0, Math.round(created / 3))),
      pipeline_id: aid("pipeline", pipeline),
      stage_id: stagesOf(pipeline)[stage].id,
      name,
      value,
      currency,
      contact_id: aid("contact", contact),
      company_id: aid("company", companyN(company)),
      owner_id: personId(owner),
      expected_close_date: dateOnly(status === "open" ? daysFromNow(close) : closedAt),
      status,
      lost_reason: reason,
      won_at: status === "won" ? closedAt : null,
      lost_at: status === "lost" ? closedAt : null,
      source_campaign_id: campaign ? aid("campaign", campaign) : null,
      created_by: personId(owner),
    });
  });
}

// History the deals trigger writes: created, each stage move, then won / lost.
function historyRows(deals) {
  const out = [];
  let n = 0;
  const push = (deal, occurred, fields) => {
    n += 1;
    out.push(
      row(aid("crm_activity", n), occurred, {
        kind: "stage_change",
        subject: "",
        body: "",
        related_type: "deal",
        related_id: deal.id,
        contact_id: deal.contact_id,
        actor_id: deal.owner_id,
        occurred_at: occurred,
        created_by: deal.owner_id,
        ...fields,
      }),
    );
  };

  DEALS.forEach(([, pipeline, stage, status, , , , , value, currency, created, close], i) => {
    const deal = deals[i];
    const stages = stagesOf(pipeline);
    const end = status === "open" ? Math.max(1, Math.round(created * 0.15)) : close;
    const step = (created - end) / (stage + 1);
    push(deal, deal.created_at, {
      kind: "system",
      subject: "Deal created",
      metadata: { event: "created", pipelineId: deal.pipeline_id, toStageId: stages[0].id, toStageName: stages[0].name, toStatus: "open", value, currency },
    });
    for (let k = 1; k <= stage; k += 1) {
      push(deal, daysAgo(created - step * k, 2), {
        subject: `Moved to ${stages[k].name}`,
        metadata: {
          event: "stage",
          fromPipelineId: deal.pipeline_id,
          pipelineId: deal.pipeline_id,
          fromStageId: stages[k - 1].id,
          toStageId: stages[k].id,
          fromStageName: stages[k - 1].name,
          toStageName: stages[k].name,
          value,
          currency,
        },
      });
    }
    if (status !== "open") {
      push(deal, status === "won" ? deal.won_at : deal.lost_at, {
        subject: status === "won" ? "Marked won" : "Marked lost",
        body: status === "lost" ? deal.lost_reason : "",
        metadata: {
          event: "status",
          pipelineId: deal.pipeline_id,
          stageId: deal.stage_id,
          stageName: stages[stage].name,
          fromStatus: "open",
          toStatus: status,
          lostReason: deal.lost_reason,
          value,
          currency,
        },
      });
    }
  });
  return { rows: out, next: n };
}

// Logged calls, meetings, notes and emails: [kind, subject, body, related type, related n|key, actor n, hours ago, contact n].
const LOGGED = [
  ["call", "Pricing call", "Walked through phase-two scope. They want the film cut-downs priced separately; sending a revised quote Friday.", "deal", 1, 1, 5, 4],
  ["meeting", "Proposal walkthrough", "Their ops lead liked the toolkit approach. Open question: print vendor in Lisbon or Porto.", "deal", 2, 2, 26, 2],
  ["email", "Sent revised timeline", "Shared the 6-week production plan and the shoot dates for the patient stories.", "deal", 3, 10, 30, 3],
  ["note", "Note", "Procurement needs three references from transit or civic work before the next round.", "deal", 4, 8, 52, 21],
  ["call", "Discovery call", "Enrolment is down 8% year on year; they want a spring campaign across social and local radio.", "deal", 5, 6, 70, 22],
  ["meeting", "Intro with Quanta founders", "Seed-stage, launching in Q1. Budget is tight but they're open to a fixed-scope sprint.", "deal", 6, 10, 20, 24],
  ["call", "Check-in on holiday campaign", "Budget confirmed; legal review of the influencer terms is the last blocker.", "deal", 8, 8, 9, 6],
  ["note", "Note", "Fernway wants recycled board for the whole range — check costs with the packaging supplier.", "deal", 9, 10, 98, 7],
  ["email", "Shared annual report moodboard", "Feedback: a more restrained palette; second round due next week.", "deal", 10, 2, 44, 8],
  ["meeting", "Summer campaign wrap-up", "Bookings up 14% over the campaign window. Next conversation: always-on social.", "deal", 19, 6, 120, 5],
  ["call", "Renewal kickoff", "They want the 2027 retainer to include two trail-series shoots and a quarterly film.", "deal", 18, 1, 75, 1],
  ["note", "Note", "Orbit prefers async updates — weekly Loom instead of a standing call.", "company", "orbit", 8, 200, null],
  ["meeting", "Quarterly business review", "Reviewed retainer performance. Store traffic from the in-store programme is tracking ahead of target.", "company", "fernway", 10, 160, 7],
  ["note", "Note", "Meridian's procurement cycle restarts in April; keep the onboarding video warm.", "company", "meridian", 2, 260, null],
  ["call", "Follow-up after lost deal", "Lumen will revisit external signage next year; keep them on the healthcare newsletter.", "company", "lumen", 10, 340, 3],
  ["email", "Sent capabilities deck", "Shared the hospitality case studies and the Solace results summary.", "company", "harbor", 3, 140, 23],
];

function loggedRows(startN) {
  return LOGGED.map(([kind, subject, body, type, ref, actor, hours, contact], i) => {
    const relatedId = type === "deal" ? aid("deal", ref) : aid("company", companyN(ref));
    const at = hoursAgo(hours);
    return row(aid("crm_activity", startN + i + 1), at, {
      kind,
      subject,
      body,
      related_type: type,
      related_id: relatedId,
      contact_id: contact ? aid("contact", contact) : null,
      actor_id: personId(actor),
      occurred_at: at,
      created_by: personId(actor),
    });
  });
}

// Tasks: [n, title, notes, related type, related n|key, assignee n, due (days from now; negative = overdue; null), priority, done days ago | null].
const TASKS = [
  [1, "Send revised phase-two quote", "Price the film cut-downs as a separate line.", "deal", 1, 1, 1, "high", null],
  [2, "Book Lisbon print vendor visit", "", "deal", 2, 2, 3, "medium", null],
  [3, "Collect three civic references", "Ask Meridian and Solace for permission to share.", "deal", 4, 8, -2, "high", null],
  [4, "Confirm influencer terms with legal", "", "deal", 8, 1, 0, "high", null],
  [5, "Draft enrolment campaign brief", "", "deal", 5, 6, 5, "medium", null],
  [6, "Second-round annual report concepts", "", "deal", 10, 2, 6, "medium", null],
  [7, "Packaging cost check with supplier", "Recycled board, full range.", "deal", 9, 10, -1, "medium", null],
  [8, "Prepare 2027 retainer proposal", "Include two trail-series shoots and a quarterly film.", "deal", 18, 1, 9, "high", null],
  [9, "Scope always-on social for Solace", "", "deal", 19, 6, 2, "medium", null],
  [10, "Send contract for photography retainer", "", "deal", 20, 8, 0, "high", null],
  [11, "Fixed-scope sprint estimate for Quanta", "", "deal", 6, 1, -3, "low", null],
  [12, "Add Harbor & Vine to hospitality newsletter", "", "company", "harbor", 3, null, "low", null],
  [13, "Quarterly review deck for Fernway", "", "company", "fernway", 10, 12, "medium", null],
  [14, "Thank-you note after the wrap-up", "", "deal", 19, 6, null, "low", 4],
  [15, "Send Kestrel launch event recap", "", "deal", 14, 1, null, "medium", 10],
  [16, "Archive Brightline social retainer files", "", "deal", 17, 8, null, "low", 7],
];

function taskRows() {
  return TASKS.map(([n, title, notes, type, ref, assignee, due, priority, doneAgo]) => {
    const relatedId = type === "deal" ? aid("deal", ref) : aid("company", companyN(ref));
    const created = daysAgo(doneAgo != null ? doneAgo + 6 : 4 + (n % 5));
    return row(aid("crm_task", n), created, {
      title,
      notes,
      due_at: due == null ? (doneAgo != null ? daysAgo(doneAgo) : null) : daysFromNow(due, 17 - new Date().getHours()),
      assignee_id: personId(assignee),
      related_type: type,
      related_id: relatedId,
      status: doneAgo != null ? "done" : "open",
      priority,
      completed_at: doneAgo != null ? daysAgo(doneAgo) : null,
      created_by: personId(assignee),
    });
  });
}

// One live deal_won tracked event per won deal (what the trigger inserts).
function wonEvents(deals) {
  return deals
    .filter((d) => d.status === "won")
    .map((d, i) =>
      row(aid("tracked_event", 9000 + i + 1), d.won_at, {
        contact_id: d.contact_id,
        anonymous_id: null,
        name: "deal_won",
        properties: {
          dealId: d.id,
          dealName: d.name,
          pipelineId: d.pipeline_id,
          stageId: d.stage_id,
          companyId: d.company_id,
          ownerId: d.owner_id,
          sourceCampaignId: d.source_campaign_id,
        },
        source: "system",
        delivery_id: null,
        campaign_id: d.source_campaign_id,
        revenue: d.value,
        currency: d.currency,
        url: null,
        referrer: null,
        utm: {},
        occurred_at: d.won_at,
        created_by: null,
      }),
    );
}

export function crmSeed() {
  const deals = dealRows();
  const history = historyRows(deals);
  return {
    companies: companies(),
    pipelines: pipelines(),
    deals,
    crm_tasks: taskRows(),
    crm_activities: [...history.rows, ...loggedRows(history.next)],
    tracked_events: wonEvents(deals),
  };
}
