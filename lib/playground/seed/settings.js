// AI & Settings seed: Halcyon Studio's workspace settings row (general, sending defaults, tracking,
// advanced, billing on the Growth plan) and a short AI assistant history. Generations are labelled
// "playground sample" — they were never produced by a model.

import { PLAYGROUND_PERSON, STUDIO } from "../cast.js";
import { PROJECT_ID, daysAgo, hoursAgo, seedIds } from "./helpers.js";

// AI & Settings code block 1200-1299.
const aid = seedIds({ workspace_setting: 1200, ai_generation: 1201 });

const SAMPLE_MODEL = "playground sample";

function generation(n, { tool, title, input, output, created }) {
  return {
    id: aid("ai_generation", n),
    project_id: PROJECT_ID,
    tool,
    title,
    input,
    output: { ...output, sample: true },
    model: SAMPLE_MODEL,
    campaign_id: null,
    segment_id: null,
    metadata: {},
    created_by: PLAYGROUND_PERSON.id,
    created_at: created,
    updated_at: created,
    deleted_at: null,
  };
}

export function settingsSeed() {
  return {
    workspace_settings: [
      {
        id: aid("workspace_setting", 1),
        project_id: PROJECT_ID,
        general: { name: STUDIO.name, timezone: "Europe/Lisbon", locale: "en-GB", currency: "EUR" },
        sending: {
          fromName: STUDIO.name,
          fromEmail: `hello@${STUDIO.domain}`,
          replyTo: `studio@${STUDIO.domain}`,
          quietHours: { start: "21:00", end: "08:00" },
          weeklyFrequencyCap: 3,
        },
        tracking: { opens: true, clicks: true, linkDomain: "", utm: { enabled: true, source: "halcyon", medium: "" } },
        advanced: { doubleOptInDefault: true, retentionMonths: 24 },
        billing: { plan: "growth", interval: "annual", cycleAnchorDay: 1, changedAt: daysAgo(96), changedBy: PLAYGROUND_PERSON.id },
        metadata: {},
        created_by: PLAYGROUND_PERSON.id,
        created_at: daysAgo(410),
        updated_at: daysAgo(12),
        deleted_at: null,
      },
    ],
    ai_generations: [
      generation(1, {
        tool: "subject_lines",
        title: "Kestrel Aero pre-orders open to the waitlist",
        input: { description: "Kestrel Aero pre-orders open to the waitlist", tone: "Bold", count: 6, personalize: true },
        output: {
          lines: [
            { subject: "Kestrel Aero pre-orders are open", preheader: "Waitlist first — 48 hours before everyone else.", angle: "news" },
            { subject: "{{first_name|You}}, your Aero is waiting", preheader: "Reserve yours before the public launch.", angle: "personal" },
            { subject: "48 hours of early access", preheader: "The waitlist gets first pick of the launch colours.", angle: "urgency" },
            { subject: "Ready to ride the Aero?", preheader: "Pre-orders just opened for the waitlist.", angle: "question" },
            { subject: "The e-bike we filmed is real", preheader: "Watch the film, then reserve the bike.", angle: "curiosity" },
            { subject: "Reserve your Aero today", preheader: "Fully refundable until it ships.", angle: "benefit" },
          ],
        },
        created: daysAgo(11, 3),
      }),
      generation(2, {
        tool: "copy",
        title: "Summit early-bird pricing ends Friday",
        input: { prompt: "Summit early-bird pricing ends Friday", contentType: "sms", tone: "Friendly", length: "Short", useBrandVoice: true },
        output: {
          contentType: "sms",
          voiceUsed: false,
          variants: [
            { label: "Variant A", angle: "Deadline", text: "Halcyon Summit early-bird pricing ends Friday. Grab your seat: halcyon.studio/summit Reply STOP to opt out" },
            { label: "Variant B", angle: "Personal", text: "Hi {{first_name|there}}, early-bird Summit tickets close Friday — save your seat at halcyon.studio/summit. Reply STOP to opt out" },
            { label: "Variant C", angle: "Benefit", text: "Two days of talks in Lisbon at the early-bird price, until Friday only: halcyon.studio/summit Reply STOP to opt out" },
          ],
        },
        created: hoursAgo(30),
      }),
    ],
  };
}
