import { runFlow, validateFlow } from "./flow_graph";
import { personalize } from "./matching";

// Flow simulator (isomorphic): one turn of a DM flow without sending anything. Effects become a transcript;
// AI steps call the injected `ai(agentId, text, history)` resolver (the server route uses the real LLM).
// The caller keeps { state, facts } between turns.

export async function simulateTurn(graph, { state = {}, facts = {}, input = null, timeout = false, settings = {}, channels = [], history = [], person = {} } = {}, { ai } = {}) {
  const result = runFlow(graph, { state, facts, input, timeout, settings });
  const transcript = [];
  let status = result.status;

  for (const effect of result.effects) {
    switch (effect.type) {
      case "send":
        transcript.push({
          role: "bot",
          nodeId: effect.nodeId,
          text: personalize(effect.message.text, person),
          quickReplies: effect.message.quickReplies || [],
          buttons: effect.message.buttons || [],
        });
        break;
      case "set_tags":
        if (effect.add.length) transcript.push({ role: "system", nodeId: effect.nodeId, text: `Tag added: ${effect.add.join(", ")}` });
        if (effect.remove.length) transcript.push({ role: "system", nodeId: effect.nodeId, text: `Tag removed: ${effect.remove.join(", ")}` });
        break;
      case "set_field":
        transcript.push({ role: "system", nodeId: effect.nodeId, text: `Saved ${effect.key} = ${effect.value}` });
        break;
      case "goal":
        transcript.push({ role: "system", nodeId: effect.nodeId, text: `Goal reached: ${effect.name}` });
        break;
      case "ai": {
        const answer = ai ? await ai(effect.agentId, effect.text, history) : null;
        if (!answer || answer.unavailable) {
          transcript.push({ role: "system", nodeId: effect.nodeId, text: answer?.note || "AI isn't configured — a live conversation hands over to a person here." });
          status = "handover";
        } else if (answer.handover) {
          if (answer.reply) transcript.push({ role: "bot", nodeId: effect.nodeId, text: answer.reply, ai: { confidence: answer.confidence } });
          transcript.push({ role: "system", nodeId: effect.nodeId, text: `Hands over to a person (${answer.reason || "low confidence"}).` });
          status = "handover";
        } else {
          transcript.push({ role: "bot", nodeId: effect.nodeId, text: answer.reply, ai: { confidence: answer.confidence, intent: answer.intent, sample: Boolean(answer.sample) } });
        }
        break;
      }
      case "handover":
        if (effect.message) transcript.push({ role: "bot", nodeId: effect.nodeId, text: effect.message });
        transcript.push({ role: "system", nodeId: effect.nodeId, text: "Handed over to a person — the bot pauses for this conversation." });
        break;
      case "jump":
        transcript.push({ role: "system", nodeId: effect.nodeId, text: "Jumps to another flow." });
        break;
      case "note":
        transcript.push({ role: "system", nodeId: effect.nodeId, text: effect.text });
        break;
      default:
        break;
    }
    if (status === "handover" && effect.type === "ai") break;
  }

  if (status === "completed") transcript.push({ role: "system", text: "Flow finished." });
  if (status === "expired") transcript.push({ role: "system", text: "No reply before the timeout — the flow ends." });
  if (result.status === "waiting" && status === "waiting") {
    const label = { buttons: "Waiting for a reply option", reply: "Waiting for an answer", delay: "Waiting for the delay to pass", ai: "AI agent is handling replies" }[result.waitingFor];
    if (label) transcript.push({ role: "system", text: label, waiting: result.waitingFor });
  }

  return {
    transcript,
    state: status === "handover" ? { ...result.state, waiting: null } : result.state,
    facts: result.facts,
    status,
    waitingFor: status === "waiting" ? result.waitingFor : "none",
    validation: validateFlow(graph, { channels }),
  };
}
