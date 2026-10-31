// Automations seed: Halcyon's workflows and journeys built from the recipe catalog, with enrollments
// simulated step by step through each graph — the step logs, the automation's own deliveries and the
// trigger / engagement / conversion events — so canvas counts, enrollment tables and stats all agree.
//
//   automationsSeed({ contacts: audience.contacts })   // optional: real addresses for delivery rows

import { PEOPLE } from "../cast.js";
import { PROJECT_ID, between, daysAgo, minutesAgo, noise, seedIds } from "./helpers.js";
import { RECIPES } from "../../automations/recipes.js";
import { getNode, nextNodeId, triggerNodeOf } from "../../automations/graph.js";
import { durationMs } from "../../automations/steps.js";
import { computeAutomationStats, statsColumn } from "../../automations/stats.js";

// Automations code block 500-599; deliveries n=20000..20999, tracked_events n=8000..8999.
const aid = seedIds({
  automation: 500,
  automation_enrollment: 501,
  automation_step_log: 502,
  automation_condition: 503,
  automation_goal: 504,
  automation_cursor: 505,
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.now() - 2 * MINUTE;
const iso = (ms) => new Date(ms).toISOString();

// Contacts the Delivery engine seed unsubscribes, bounces or marks as complaining — kept out of sends.
const OPTED_OUT = new Set([13, 22, 29, 37, 41, 44]);
const PRIYA = PEOPLE.find((p) => p.n === 10) || PEOPLE[0];

const GOALS = [
  { n: 1, name: "Completed an order", description: "Any order in a connected store within a week of entering.", event_name: "order_completed", filters: [], window_days: 7 },
  {
    n: 2,
    name: "Booked a demo",
    description: "Submitted the demo request form.",
    event_name: "form_submitted",
    filters: [{ id: "f_demo", property: "form_id", operator: "eq", value: "demo-request" }],
    window_days: 30,
  },
  { n: 3, name: "Came back to the site", description: "Viewed any page on halcyon.studio again.", event_name: "page_viewed", filters: [], window_days: 14 },
];

const CONDITIONS = [
  {
    n: 1,
    name: "Engaged in the last 30 days",
    description: "Opened at least one email recently.",
    match: "all",
    conditions: [{ id: "c_eng", field: "engagement.opened", operator: "performed", value: { count: 1, days: 30 } }],
  },
  { n: 2, name: "High lead score", description: "Sales-ready by score.", match: "all", conditions: [{ id: "c_score", field: "leadScore", operator: "gte", value: 50 }] },
  {
    n: 3,
    name: "VIP customers",
    description: "Tagged VIP or scoring 80 and above.",
    match: "any",
    conditions: [
      { id: "c_vip", field: "tags", operator: "has", value: "vip" },
      { id: "c_vip_score", field: "leadScore", operator: "gte", value: 80 },
    ],
  },
  {
    n: 4,
    name: "Newsletter subscriber",
    description: "On the Halcyon newsletter list.",
    match: "all",
    conditions: [{ id: "c_news", field: "lists", operator: "in_list", value: aid("list", 1) }],
  },
];

const recipe = (key) => RECIPES.find((r) => r.key === key);
const setConfig = (graph, nodeId, patch) => ({
  ...graph,
  nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n)),
});
const contactsFrom = (list) => list.filter((c) => !OPTED_OUT.has(c));

// Each automation: recipe, Halcyon-specific tweaks, who entered and over how many days.
const AUTOMATIONS = [
  {
    n: 1,
    recipe: "welcome_series",
    name: "Halcyon newsletter welcome",
    description: "Three emails that introduce the studio to new newsletter subscribers.",
    status: "active",
    published: 46,
    tweak: (g) =>
      setConfig(setConfig(g, "trigger", { filters: [{ id: "f_list", property: "list_id", operator: "eq", value: aid("list", 1) }] }), "n5", {
        mode: "rules",
        source: "saved",
        conditionSetId: aid("automation_condition", 1),
      }),
    contacts: contactsFrom(Array.from({ length: 34 }, (_, i) => i + 1)),
    spread: 44,
    event: (c, t) => ({ name: "list_joined", properties: { list_id: aid("list", 1), source: "form" }, source: "system", at: t, salt: c }),
  },
  {
    n: 2,
    recipe: "abandoned_cart",
    name: "Kestrel Aero cart recovery",
    description: "Email, then SMS, then a code for shoppers who leave an Aero pre-order in the cart.",
    status: "active",
    published: 34,
    tweak: (g) => setConfig(g, "n7", { source: "saved", goalId: aid("automation_goal", 1) }),
    contacts: contactsFrom([3, 5, 8, 11, 14, 17, 19, 23, 26, 31, 34, 38, 40, 45, 47]),
    spread: 30,
    conversion: { rate: 0.34, minHours: 3, maxHours: 70, name: "order_completed" },
    event: (c, t) => ({ name: "cart_abandoned", properties: { cart_id: `cart_${c}`, value: between(c * 3, 1400, 4200) / 1, product: "Kestrel Aero" }, source: "commerce", at: t, salt: c }),
  },
  {
    n: 3,
    recipe: "post_purchase",
    name: "Post-purchase follow-up",
    description: "Thank-you, pairing recommendations and a review request after an order.",
    status: "active",
    published: 28,
    contacts: contactsFrom([2, 6, 9, 12, 16, 20, 24, 27, 30, 33, 39, 43, 46]),
    spread: 26,
    event: (c, t) => ({ name: "order_completed", properties: { order_id: `ord_${4100 + c}` }, revenue: between(c * 5, 45, 320), source: "commerce", at: t, salt: c }),
  },
  {
    n: 4,
    recipe: "win_back",
    name: "Win-back: quiet for 90 days",
    description: "Re-engage lapsed subscribers and sunset the ones who stay quiet.",
    status: "paused",
    published: 60,
    contacts: contactsFrom([7, 15, 18, 25, 28, 35, 42, 48]),
    spread: 40,
    inactivity: true,
  },
  {
    n: 5,
    recipe: "birthday",
    name: "Birthday reward",
    description: "A gift on each contact's birthday and a reminder before it expires.",
    status: "draft",
    contacts: [],
  },
  {
    n: 6,
    recipe: "re_engagement",
    name: "Summit re-engagement",
    description: "Email, SMS and push for Summit registrants who went quiet.",
    status: "active",
    published: 21,
    tweak: (g) => setConfig(g, "n8", { source: "saved", goalId: aid("automation_goal", 3) }),
    contacts: contactsFrom([4, 10, 21, 32, 36, 39, 45, 47, 48]),
    spread: 18,
    inactivity: true,
    conversion: { rate: 0.22, minHours: 30, maxHours: 200, name: "page_viewed" },
  },
  {
    n: 7,
    recipe: "lead_nurture",
    name: "Studio lead nurture",
    description: "Three weeks of case studies for agency leads, handing engaged ones to Priya.",
    status: "draft",
    tweak: (g) => setConfig(g, "n9", { userId: PRIYA.id, email: PRIYA.email }),
    contacts: [],
  },
  {
    n: 8,
    recipe: "browse_abandonment",
    name: "Browse abandonment",
    description: "A follow-up for known visitors who looked at the Aero but didn't order.",
    status: "active",
    published: 18,
    contacts: contactsFrom([1, 5, 9, 14, 19, 24, 30, 35, 40, 46]),
    spread: 16,
    conversion: { rate: 0.26, minHours: 4, maxHours: 120, name: "order_completed" },
    event: (c, t) => ({ name: "product_viewed", properties: { product_id: "kestrel-aero", url: "https://kestrelbikes.example/aero" }, url: "https://kestrelbikes.example/aero", source: "web", at: t, salt: c }),
  },
];

function contactInfo(c, contacts) {
  const row = contacts?.find((r) => r.id === aid("contact", c));
  const tier = noise(c * 7.3);
  return {
    id: aid("contact", c),
    email: row?.email || `contact${c}@halcyon-audience.example`,
    phone: row?.phone || `+1555010${String(c).padStart(4, "0")}`,
    engagement: tier < 0.3 ? 0.72 : tier < 0.75 ? 0.42 : 0.12,
  };
}

const CHANNEL_OF = { send_email: "email", send_sms: "sms", send_whatsapp: "whatsapp", send_push: "push" };
const CONNECTION_OF = { sms: 2, whatsapp: 3, push: 4 };
const PROVIDER_OF = { email: "geiger_email", sms: "twilio", whatsapp: "meta_cloud", push: "web_push" };

export function automationsSeed({ contacts = null } = {}) {
  const automations = [];
  const enrollments = [];
  const logs = [];
  const deliveries = [];
  const events = [];
  let e = 0;
  let l = 0;
  let d = 0;
  let t = 0;

  const event = ({ contactId, name, properties = {}, source = "system", at, deliveryId = null, revenue = null, url = null }) => {
    t += 1;
    const row = {
      id: aid("tracked_event", 8000 + t),
      project_id: PROJECT_ID,
      contact_id: contactId,
      anonymous_id: null,
      name,
      properties,
      source,
      delivery_id: deliveryId,
      campaign_id: null,
      revenue,
      currency: revenue != null ? "USD" : null,
      url,
      referrer: null,
      utm: {},
      occurred_at: iso(at),
      metadata: {},
      created_by: null,
      created_at: iso(at),
      updated_at: iso(at),
      deleted_at: null,
    };
    events.push(row);
    return row;
  };

  for (const spec of AUTOMATIONS) {
    const built = recipe(spec.recipe).build();
    const graph = spec.tweak ? spec.tweak(built.graph) : built.graph;
    const automationId = aid("automation", spec.n);
    const publishedAt = spec.published ? Date.parse(daysAgo(spec.published)) : null;
    const automation = {
      id: automationId,
      project_id: PROJECT_ID,
      kind: recipe(spec.recipe).kind,
      name: spec.name,
      description: spec.description,
      status: spec.status,
      trigger: graph.nodes.find((n) => n.type === "trigger").data.config,
      graph,
      settings: built.settings,
      stats: {},
      published_at: publishedAt ? iso(publishedAt) : null,
      metadata: { recipe: spec.recipe },
      created_by: PEOPLE[spec.n % 4].id,
      created_at: daysAgo((spec.published || 6) + 3),
      updated_at: spec.status === "paused" ? daysAgo(9) : daysAgo(Math.max(1, (spec.published || 6) - 2)),
      deleted_at: null,
    };
    automations.push(automation);

    const trigger = triggerNodeOf(graph);
    const goalNode = graph.nodes.find((n) => n.type === "goal");
    const ownEnrollments = [];
    const ownLogs = [];

    spec.contacts.forEach((c, i) => {
      e += 1;
      const enrollmentId = aid("automation_enrollment", e);
      const who = contactInfo(c, contacts);
      const span = Math.max(1, (spec.spread || 10) * DAY);
      let at = (publishedAt || NOW - span) + DAY / 3 + Math.floor(noise(spec.n * 101 + i) * (Math.min(span, NOW - (publishedAt || NOW - span)) - DAY / 2));
      if (spec.status === "paused") at = Math.min(at, NOW - 12 * DAY);
      const enteredAt = at;
      const log = (node, action, status, detail, when) => {
        l += 1;
        const row = {
          id: aid("automation_step_log", l),
          project_id: PROJECT_ID,
          automation_id: automationId,
          enrollment_id: enrollmentId,
          contact_id: who.id,
          node_id: node.id,
          node_type: node.type,
          action,
          status,
          detail,
          metadata: {},
          created_by: null,
          created_at: iso(when),
          updated_at: iso(when),
          deleted_at: null,
        };
        logs.push(row);
        ownLogs.push(row);
      };

      const triggerEvent = spec.event ? spec.event(c, enteredAt - 20_000) : null;
      const triggerRow = triggerEvent
        ? event({ contactId: who.id, name: triggerEvent.name, properties: triggerEvent.properties, source: triggerEvent.source, at: triggerEvent.at, revenue: triggerEvent.revenue ?? null, url: triggerEvent.url ?? null })
        : null;
      const triggerKey = triggerRow ? `event:${triggerRow.id}` : `inactive:${iso(enteredAt - 90 * DAY)}`;
      const context = { trigger: triggerRow ? { event: triggerRow.name, eventId: triggerRow.id, properties: triggerRow.properties } : { type: "inactivity", key: triggerKey } };
      log(trigger, "enrolled", "ok", triggerRow ? { event: triggerRow.name, eventId: triggerRow.id } : { trigger: "inactivity" }, enteredAt);

      const conv = spec.conversion && noise(spec.n * 211 + c) < spec.conversion.rate
        ? enteredAt + (spec.conversion.minHours + noise(spec.n * 307 + c) * (spec.conversion.maxHours - spec.conversion.minHours)) * HOUR
        : null;
      const converts = conv && conv <= NOW;
      const sent = {};
      const visited = [];
      let clock = enteredAt;
      let status = "completed";
      let reason = "completed";
      let current = trigger.id;
      let nextRun = null;
      let nodeId = nextNodeId(graph, trigger.id, "out");

      const convert = (when) => {
        const row = event({
          contactId: who.id,
          name: spec.conversion.name,
          properties: spec.conversion.name === "order_completed" ? { order_id: `ord_${5200 + e}` } : { url: "https://halcyon.studio/summit" },
          source: spec.conversion.name === "order_completed" ? "commerce" : "web",
          at: when,
          revenue: spec.conversion.name === "order_completed" ? between(e * 11, 1200, 3900) : null,
          url: spec.conversion.name === "page_viewed" ? "https://halcyon.studio/summit" : null,
        });
        Object.assign(context, { convertedAt: iso(when + 30_000), goalNodeId: goalNode?.id || null, goalId: goalNode?.data?.config?.goalId || null, goalEventId: row.id });
      };

      for (let guard = 0; guard < 30 && nodeId; guard += 1) {
        const node = getNode(graph, nodeId);
        current = node.id;
        const cfg = node.data.config;
        if (converts && conv <= clock && built.settings.exitOnGoal && goalNode) {
          convert(conv);
          log(goalNode, "goal.reached", "ok", { event: spec.conversion.name, exited: true }, conv + 30_000);
          current = goalNode.id;
          reason = "goal_reached";
          clock = conv + 30_000;
          nodeId = null;
          break;
        }

        if (node.type === "wait") {
          const until = clock + durationMs(cfg.amount, cfg.unit);
          log(node, "wait.started", "waiting", { until: iso(until) }, clock);
          if (converts && conv <= until && built.settings.exitOnGoal && goalNode) {
            clock = conv;
            continue;
          }
          if (until > NOW || spec.status === "paused") {
            status = "waiting";
            nextRun = until;
            context.waiting = { nodeId: node.id, kind: "duration", since: iso(clock), until: iso(until) };
            break;
          }
          clock = until;
          log(node, "wait.done", "ok", {}, clock);
        } else if (CHANNEL_OF[node.type]) {
          const channel = CHANNEL_OF[node.type];
          d += 1;
          const deliveryId = aid("delivery", 20000 + d);
          const sentAt = clock + 40_000;
          const opened = noise(spec.n * 13 + c * 7 + d) < who.engagement;
          const clicked = opened && noise(spec.n * 17 + c * 3 + d) < 0.38;
          const openedAt = opened ? sentAt + (8 + noise(d * 5) * 600) * MINUTE : null;
          const clickedAt = clicked ? openedAt + (1 + noise(d * 9) * 20) * MINUTE : null;
          const visibleOpen = openedAt && openedAt <= NOW;
          const visibleClick = clickedAt && clickedAt <= NOW;
          deliveries.push({
            id: deliveryId,
            project_id: PROJECT_ID,
            channel,
            status: channel === "email" ? (visibleClick ? "clicked" : visibleOpen ? "opened" : "delivered") : channel === "sms" ? "delivered" : visibleOpen ? "read" : "delivered",
            contact_id: who.id,
            to_address: channel === "email" ? who.email : channel === "push" ? who.id : who.phone,
            source_type: "automation",
            source_id: automationId,
            campaign_id: null,
            variant: null,
            subject: channel === "email" ? cfg.subject.replace(/\{\{\s*first_name\s*\|\s*there\s*\}\}/, "there") : null,
            provider: PROVIDER_OF[channel],
            provider_id: `pg_${spec.n}_${d}`,
            connection_id: channel === "email" ? null : aid("connection", CONNECTION_OF[channel]),
            error: null,
            cost: channel === "sms" ? 0.0079 : 0,
            currency: "USD",
            open_count: channel === "email" && visibleOpen ? 1 + Math.floor(noise(d * 3) * 2) : 0,
            click_count: channel === "email" && visibleClick ? 1 : 0,
            idempotency_key: `automation:${enrollmentId}:${node.id}`,
            sent_at: iso(sentAt),
            delivered_at: iso(sentAt + 4_000),
            opened_at: visibleOpen ? iso(openedAt) : null,
            clicked_at: visibleClick ? iso(clickedAt) : null,
            bounced_at: null,
            unsubscribed_at: null,
            metadata: { automationId, enrollmentId, nodeId: node.id },
            created_by: null,
            created_at: iso(clock),
            updated_at: iso(visibleClick ? clickedAt : visibleOpen ? openedAt : sentAt),
            deleted_at: null,
          });
          if (channel === "email" && visibleOpen) event({ contactId: who.id, name: "email_opened", properties: { automation_id: automationId }, source: "email", at: openedAt, deliveryId });
          if (channel === "email" && visibleClick) {
            const href = cfg.buttonUrl || "https://halcyon.studio";
            event({ contactId: who.id, name: "email_clicked", properties: { automation_id: automationId, url: href }, source: "email", at: clickedAt, deliveryId, url: href });
          }
          sent[node.id] = { opened: visibleOpen, clicked: visibleClick };
          log(node, `${channel}.sent`, "ok", { deliveryId, to: channel === "email" ? who.email : channel === "push" ? "1 device" : who.phone }, sentAt);
          clock = sentAt;
        } else if (node.type === "condition") {
          let yes;
          if (cfg.mode === "message") yes = Boolean(cfg.engagement === "clicked" ? sent[cfg.messageNodeId]?.clicked : sent[cfg.messageNodeId]?.opened);
          else if (cfg.mode === "event") yes = noise(spec.n * 41 + c) < 0.2;
          else yes = noise(c * 7.3) < 0.75;
          clock += 5_000;
          log(node, `condition.${yes ? "yes" : "no"}`, "ok", cfg.mode === "message" ? { messageNodeId: cfg.messageNodeId, engagement: cfg.engagement } : {}, clock);
          visited.push(node.id);
          nodeId = nextNodeId(graph, node.id, yes ? "yes" : "no");
          continue;
        } else if (node.type === "goal") {
          clock += 5_000;
          if (converts && !context.convertedAt) {
            convert(Math.min(conv, NOW - MINUTE));
            log(node, "goal.reached", "ok", { event: spec.conversion?.name }, Math.max(clock, conv));
          } else {
            log(node, "goal.pending", "ok", {}, clock);
          }
        } else if (node.type === "exit") {
          clock += 5_000;
          log(node, "exit", "ok", { reason: cfg.reason }, clock);
          reason = cfg.reason || "exit_step";
          visited.push(node.id);
          nodeId = null;
          break;
        } else {
          clock += 5_000;
          const action = node.type === "update_contact" ? "contact.updated" : node.type === "list" ? (cfg.action === "remove" ? "list.removed" : "list.added") : `${node.type}.sent`;
          log(node, action, "ok", node.type === "update_contact" ? { addTags: cfg.addTags || [], removeTags: cfg.removeTags || [] } : {}, clock);
        }
        visited.push(node.id);
        nodeId = nextNodeId(graph, node.id, "out");
      }

      if (status !== "waiting" && converts && !context.convertedAt && goalNode && built.settings.exitOnGoal) {
        convert(conv);
        reason = "goal_reached";
      }
      const finishedAt = status === "waiting" ? null : Math.min(clock + 1_000, NOW);
      const row = {
        id: enrollmentId,
        project_id: PROJECT_ID,
        automation_id: automationId,
        contact_id: who.id,
        status,
        current_node_id: current,
        next_run_at: nextRun ? iso(nextRun) : null,
        trigger_key: triggerKey,
        context: { ...context, visited },
        entered_at: iso(enteredAt),
        completed_at: finishedAt ? iso(finishedAt) : null,
        exit_reason: status === "waiting" ? null : reason,
        metadata: {},
        created_by: null,
        created_at: iso(enteredAt),
        updated_at: iso(finishedAt || clock),
        deleted_at: null,
      };
      enrollments.push(row);
      ownEnrollments.push(row);
    });

    automation.stats = statsColumn(computeAutomationStats(ownEnrollments, ownLogs), new Date(NOW));
  }

  const conditionRows = CONDITIONS.map((c) => ({
    id: aid("automation_condition", c.n),
    project_id: PROJECT_ID,
    name: c.name,
    description: c.description,
    match: c.match,
    conditions: c.conditions,
    metadata: {},
    created_by: PEOPLE[1].id,
    created_at: daysAgo(50 - c.n * 6),
    updated_at: daysAgo(20 - c.n * 3),
    deleted_at: null,
  }));

  const goalRows = GOALS.map((g) => ({
    id: aid("automation_goal", g.n),
    project_id: PROJECT_ID,
    name: g.name,
    description: g.description,
    event_name: g.event_name,
    filters: g.filters,
    window_days: g.window_days,
    metadata: {},
    created_by: PEOPLE[9].id,
    created_at: daysAgo(52 - g.n * 5),
    updated_at: daysAgo(30 - g.n * 4),
    deleted_at: null,
  }));

  return {
    automations,
    automation_enrollments: enrollments,
    automation_step_logs: logs,
    automation_conditions: conditionRows,
    automation_goals: goalRows,
    automation_cursors: [
      {
        id: aid("automation_cursor", 1),
        project_id: PROJECT_ID,
        last_event_at: minutesAgo(4),
        last_event_ids: [],
        last_scan_at: minutesAgo(24),
        metadata: {},
        created_by: null,
        created_at: daysAgo(60),
        updated_at: minutesAgo(4),
        deleted_at: null,
      },
    ],
    deliveries,
    tracked_events: events,
  };
}
