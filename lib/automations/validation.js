// Pre-publish checks for an automation (isomorphic, pure): the canvas shows them inline and the
// publish route re-runs them, so an invalid graph never goes live. Errors block publishing; warnings don't.

import {
  ancestorMessageNodes,
  getNode,
  graphEdges,
  graphNodes,
  handleOf,
  nextNodeId,
  nodesOnCycles,
  reachableFrom,
  triggerNodeOf,
} from "./graph.js";
import { nodeHandles } from "./steps.js";
import { triggerIssues } from "./triggers.js";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const blank = (v) => String(v ?? "").trim() === "";

export function isValidWebhookUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (host === "[::1]" || host.startsWith("[fc") || host.startsWith("[fd") || host.startsWith("[fe80")) return false;
    return true;
  } catch {
    return false;
  }
}

function nodeConfigIssues(node, graph, refs) {
  const c = node.data?.config || {};
  const out = [];
  const err = (message) => out.push({ severity: "error", message });
  const warn = (message) => out.push({ severity: "warning", message });
  const has = (set, id) => !set || set.has(id);

  switch (node.type) {
    case "trigger":
      for (const message of triggerIssues(c)) err(message);
      break;
    case "send_email":
      if (c.source === "campaign") {
        if (!c.campaignId) err("Pick the campaign whose content this email reuses.");
        else if (!has(refs.campaignIds, c.campaignId)) err("The campaign this email reuses no longer exists.");
      } else {
        if (blank(c.subject)) err("Add a subject line.");
        if (blank(c.body) && blank(c.heading)) err("Write the email body.");
        if (!blank(c.buttonLabel) && blank(c.buttonUrl)) err("The button needs a link.");
      }
      if (!blank(c.fromEmail) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.fromEmail)) err("The from address isn't a valid email.");
      break;
    case "send_sms":
      if (blank(c.body)) err("Write the SMS message.");
      break;
    case "send_whatsapp":
      if (blank(c.templateName) && blank(c.body)) err("Choose a template or write a message.");
      if (blank(c.templateName) && !blank(c.body)) warn("Without a template, WhatsApp only delivers inside the 24-hour reply window.");
      break;
    case "send_push":
      if (blank(c.title)) err("Add a notification title.");
      if (blank(c.body)) err("Add the notification text.");
      break;
    case "wait":
      if (c.mode === "until") {
        if (!Array.isArray(c.weekdays) || !c.weekdays.length) err("Pick at least one day.");
        if (!TIME.test(String(c.time || ""))) err("Set a time like 09:00.");
      } else if (c.mode === "event") {
        if (blank(c.event)) err("Name the event to wait for.");
        if (!(Number(c.timeoutAmount) >= 1)) err("Set how long to wait before timing out.");
      } else if (!(Number(c.amount) >= 1)) {
        err("Wait at least 1 " + (c.unit || "day").replace(/s$/, "") + ".");
      }
      break;
    case "condition":
      if (c.mode === "event") {
        if (blank(c.event)) err("Name the event to check for.");
        if (!(Number(c.withinDays) >= 1)) err("Look back at least 1 day.");
      } else if (c.mode === "message") {
        const earlier = ancestorMessageNodes(graph, node.id);
        if (!c.messageNodeId) err("Pick the earlier message to check.");
        else if (!earlier.some((m) => m.id === c.messageNodeId)) err("The message it checks must come before this step.");
      } else if (c.source === "saved") {
        if (!c.conditionSetId) err("Pick a saved condition.");
        else if (!has(refs.conditionSetIds, c.conditionSetId)) err("The saved condition no longer exists.");
      } else if (!Array.isArray(c.conditions) || !c.conditions.length) {
        err("Add at least one rule.");
      } else if (c.conditions.some((r) => blank(r.field) || blank(r.operator))) {
        err("Every rule needs a field and an operator.");
      }
      break;
    case "split": {
      const branches = Array.isArray(c.branches) ? c.branches : [];
      if (branches.length < 2) err("A split needs at least two paths.");
      const total = branches.reduce((s, b) => s + (Number(b.percent) || 0), 0);
      if (branches.length >= 2 && total !== 100) err(`Paths add up to ${total}%, not 100%.`);
      if (new Set(branches.map((b) => b.key)).size !== branches.length) err("Each path needs its own key.");
      break;
    }
    case "goal":
      if (c.source === "saved") {
        if (!c.goalId) err("Pick a saved goal.");
        else if (!has(refs.goalIds, c.goalId)) err("The saved goal no longer exists.");
      } else if (blank(c.event)) {
        err("Name the event that counts as reaching the goal.");
      }
      if (c.ifNotMet === "wait" && !(Number(c.waitDays) >= 1)) err("Wait at least 1 day for the goal.");
      break;
    case "update_contact":
      if (!c.addTags?.length && !c.removeTags?.length && !c.fields?.some((f) => !blank(f.key)) && !Number(c.leadScoreDelta)) {
        err("Choose at least one change.");
      }
      break;
    case "list":
      if (!c.listId) err("Choose the list.");
      else if (!has(refs.listIds, c.listId)) err("That list no longer exists.");
      break;
    case "webhook":
      if (c.target === "endpoints") {
        if (blank(c.event)) err("Name the webhook event.");
      } else if (blank(c.url)) {
        err("Add the URL to call.");
      } else if (!isValidWebhookUrl(c.url)) {
        err("Use a public http(s) URL.");
      }
      break;
    case "notify":
      if (blank(c.email)) err("Choose who to notify.");
      if (blank(c.subject)) err("Add a subject for the notification.");
      break;
    default:
      break;
  }
  return out;
}

// { issues: [{ id, nodeId, severity, message }], errors, warnings, byNode: { [nodeId]: issue[] } }.
// refs (optional): { campaignIds, conditionSetIds, goalIds, listIds } as Sets to check references exist.
export function validateAutomation({ graph, settings } = {}, refs = {}) {
  const issues = [];
  const add = (nodeId, severity, message) => issues.push({ id: `${nodeId || "automation"}:${issues.length}`, nodeId: nodeId || null, severity, message });

  const nodes = graphNodes(graph);
  const triggers = nodes.filter((n) => n.type === "trigger");
  if (!triggers.length) add(null, "error", "Add a trigger so contacts can enter.");
  if (triggers.length > 1) for (const t of triggers.slice(1)) add(t.id, "error", "Only one trigger is allowed.");

  const trigger = triggerNodeOf(graph);
  const reachable = reachableFrom(graph, trigger?.id);
  const cycles = nodesOnCycles(graph);
  const steps = nodes.filter((n) => n.type !== "trigger");
  if (trigger && !steps.length) add(trigger.id, "error", "Add a step after the trigger.");
  if (trigger && steps.length && !nextNodeId(graph, trigger.id, "out")) add(trigger.id, "error", "Connect the trigger to the first step.");

  for (const node of nodes) {
    if (node.type !== "trigger" && !reachable.has(node.id)) add(node.id, "error", "Not connected to the trigger.");
    if (cycles.has(node.id)) add(node.id, "error", "This path loops back to an earlier step.");

    const handles = nodeHandles(node);
    const outgoing = graphEdges(graph).filter((e) => e.source === node.id && getNode(graph, e.target));
    for (const h of handles) {
      const count = outgoing.filter((e) => handleOf(e) === h.id).length;
      if (count > 1) add(node.id, "error", `More than one step follows ${h.label ? `“${h.label}”` : "this step"}.`);
      if (!count && handles.length > 1 && reachable.has(node.id)) add(node.id, "warning", `Nothing follows “${h.label}” — contacts on that path finish here.`);
    }
    if (outgoing.some((e) => !handles.some((h) => h.id === handleOf(e)))) add(node.id, "error", "A connection leaves from a path this step no longer has.");

    for (const issue of nodeConfigIssues(node, graph, refs)) add(node.id, issue.severity, issue.message);
  }

  const qh = settings?.quietHours;
  if (qh?.enabled && (!TIME.test(String(qh.start || "")) || !TIME.test(String(qh.end || "")))) add(null, "error", "Quiet hours need a start and end time like 21:00.");
  const cap = settings?.frequencyCap;
  if (cap?.enabled && (!(Number(cap.max) >= 1) || !(Number(cap.periodDays) >= 1))) add(null, "error", "The frequency cap needs at least 1 message per at least 1 day.");

  const byNode = {};
  for (const issue of issues) if (issue.nodeId) (byNode[issue.nodeId] ||= []).push(issue);
  return {
    issues,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    byNode,
  };
}
