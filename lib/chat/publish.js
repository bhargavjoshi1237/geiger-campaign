import { KIND_CHANNELS, QUICK_REPLY_TITLE_MAX } from "./rules";
import { startNode, validateFlow } from "./flow_graph";

// Publish / pause for every chat resource (server-only). Publishing validates the row against what the
// platforms accept and what the engine needs; a flow publish snapshots its graph so live sessions only
// ever run a reviewed version.

export const CHAT_RESOURCES = {
  automations: { table: "chat_automations", label: "automation", published: true },
  flows: { table: "dm_flows", label: "flow", published: true },
  sequences: { table: "chat_sequences", label: "sequence", published: true },
  agents: { table: "ai_agents", label: "AI agent", published: true },
  entry_points: { table: "entry_points", label: "entry point", published: false },
  handover_rules: { table: "handover_rules", label: "handover rule", published: false },
};

const hasText = (v) => Boolean(String(v || "").trim());

function buttonErrors(buttons = []) {
  const errors = [];
  for (const b of buttons) {
    if (!hasText(b.title)) errors.push("A button has no label.");
    else if (b.type !== "url" && String(b.title).length > QUICK_REPLY_TITLE_MAX) errors.push(`Reply buttons are limited to ${QUICK_REPLY_TITLE_MAX} characters.`);
    if (b.type === "url" && !/^https?:\/\//i.test(String(b.url || ""))) errors.push(`Button “${b.title || "Untitled"}” needs a full URL.`);
  }
  return errors;
}

function automationErrors(row) {
  const errors = [];
  const trigger = row.trigger || {};
  const actions = row.actions || {};
  const dm = actions.dm || {};
  const allowed = KIND_CHANNELS[row.kind] || [];
  const channels = row.channels || [];
  if (!channels.length) errors.push("Choose at least one channel.");
  for (const c of channels) if (!allowed.includes(c)) errors.push(`${c} doesn't support this trigger.`);
  const hasDm = hasText(dm.text) || Boolean(dm.flowId);

  switch (row.kind) {
    case "comment_to_dm":
      if (!trigger.allPosts && !(trigger.postIds || []).length && !trigger.includeAds) errors.push("Pick the posts (or ads) this automation watches.");
      if (trigger.match !== "any" && !(trigger.keywords || []).length) errors.push("Add at least one keyword, or match any comment.");
      if (!hasText(dm.text)) errors.push("Write the private reply — it's the one DM a comment allows.");
      break;
    case "keyword":
      if (!(trigger.keywords || []).length) errors.push("Add at least one keyword.");
      if (!hasDm) errors.push("Write a reply or choose a flow.");
      break;
    case "referral":
      if (!(trigger.refs || []).length) errors.push("Add the ref values this automation answers.");
      if (!hasDm) errors.push("Write a reply or choose a flow.");
      break;
    case "story_reply":
      if (trigger.match && trigger.match !== "any" && !(trigger.keywords || []).length) errors.push("Add a keyword, or reply to every story reply.");
      if (!hasDm) errors.push("Write a reply or choose a flow.");
      break;
    default:
      if (!hasDm) errors.push("Write a reply or choose a flow.");
  }
  errors.push(...buttonErrors(dm.buttons || []));
  if ((actions.publicReplies || []).some((v) => String(v).length > 2000)) errors.push("Public replies are limited to 2,000 characters.");
  return errors;
}

// -> { errors: [string], patch: {} } for the publish action.
export function preparePublish(resource, row, { steps = [] } = {}) {
  const errors = [];
  const now = new Date().toISOString();
  const patch = { status: "active" };
  if (CHAT_RESOURCES[resource]?.published) patch.published_at = now;

  switch (resource) {
    case "automations":
      errors.push(...automationErrors(row));
      break;
    case "flows": {
      if (!(row.channels || []).length) errors.push("Choose at least one channel.");
      const result = validateFlow(row.graph, { channels: row.channels || [] });
      errors.push(...result.errors.map((e) => e.message));
      patch.published_graph = row.graph;
      patch.version = Number(row.version || 0) + 1;
      patch.entry = { nodeId: startNode(row.graph)?.id || null };
      break;
    }
    case "sequences":
      if (!(row.channels || []).length) errors.push("Choose at least one channel.");
      if (!steps.length) errors.push("Add at least one step.");
      steps.forEach((s, i) => {
        if (!hasText(s.message?.text)) errors.push(`Step ${i + 1} has no message.`);
      });
      if (!row.trigger?.type) errors.push("Choose what enrolls people.");
      break;
    case "agents":
      if (!hasText(row.persona) && !hasText(row.instructions)) errors.push("Describe the agent's persona or instructions.");
      if (!(row.knowledge || []).some((k) => hasText(k.content))) errors.push("Add knowledge the agent can answer from (refresh URL sources first).");
      break;
    case "entry_points":
      if (!/^https?:\/\//.test(String(row.url || ""))) errors.push("The entry point has no link yet — choose a connected account.");
      break;
    case "handover_rules": {
      const c = row.conditions || {};
      const any = (c.keywords || []).length || c.sentiment || Number(c.noMatchCount) > 0 || (c.vipTags || []).length || (c.aiConfidenceBelow != null && c.aiConfidenceBelow !== "");
      if (!any) errors.push("Add at least one condition.");
      break;
    }
    default:
      errors.push("Unknown resource.");
  }
  return { errors: [...new Set(errors)], patch };
}
