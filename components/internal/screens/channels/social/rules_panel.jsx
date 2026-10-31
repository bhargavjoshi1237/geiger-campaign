"use client";

import React, { useMemo } from "react";
import { Badge, SettingsList, SettingRow } from "@geiger/ui";
import { PLATFORM_RULES } from "@/lib/social/accounts/catalog";
import { DAY, HOUR, recentlyAt, windowState } from "./view_model";

// The platform rules each channel lives under, with the live numbers the product enforces them against
// (open windows, sends a rule blocked, trigger DMs under the 24h cap). Scoped to one account or a whole channel.

const TRIGGERED = new Set(["comment", "story_reply", "story_mention"]);
const SENT = new Set(["sent", "delivered", "read", "opened", "clicked", "replied"]);

function useRuleMetrics({ channel, connections, conversations, deliveries, now }) {
  return useMemo(() => {
    const dms = conversations.filter((c) => c.kind !== "comment");
    const windows = dms.map((c) => windowState(c, channel, now));
    const open = windows.filter((w) => w.state === "open");
    const soon = open.filter((w) => w.expiresAt && new Date(w.expiresAt).getTime() - now < 2 * HOUR).length;
    const week = deliveries.filter((d) => recentlyAt(d.createdAt, now, 7 * DAY));
    const blocked = (rule) => week.filter((d) => d.blockedBy === rule).length;
    const triggerSent = deliveries.filter((d) => TRIGGERED.has(d.trigger) && SENT.has(d.status) && recentlyAt(d.createdAt, now, DAY)).length;
    const privateReplies = week.filter((d) => d.commentId && SENT.has(d.status)).length;
    const handoverSet = connections.filter((c) => c.config?.settings?.handover?.keywords?.length).length;
    const single = connections.length === 1 ? connections[0] : null;
    const launch = single?.health?.launch;
    const regions = [...new Set(connections.map((c) => c.config?.region).filter(Boolean))];

    return {
      window: `${open.length} open now · ${soon} closing within 2h · ${blocked("window")} blocked (7d)`,
      human: `${windows.filter((w) => w.state === "human").length} in the human-only window`,
      cap: `${triggerSent} trigger DMs in 24h · ${blocked("cap")} skipped (7d)`,
      handover: single
        ? single.config?.settings?.handover?.keywords?.length
          ? `Keywords: ${single.config.settings.handover.keywords.join(", ")}`
          : "No handover keywords set"
        : `${handoverSet} of ${connections.length} accounts set`,
      private: `${privateReplies} private replies · ${blocked("private_reply")} refused (7d)`,
      optin: "Opt-ins and stops are logged",
      start: `${dms.length} people started the bot`,
      blocked: `${blocked("blocked")} sends to blocked chats (7d)`,
      rate: "",
      region: regions.length ? `Account region: ${regions.join(", ")} · ${blocked("region")} refused (7d)` : "Region checked at connect",
      business: "Checked at connect",
      comments: "Not offered",
      vetting: launch ? (launch.launched ? "Launched" : "Not launched — testers only") : single?.health?.checkedAt ? "Launch state unavailable" : "Not checked",
      consent: "Opt-in required",
      capability: `${blocked("capability")} unreachable numbers (7d)`,
    };
  }, [channel, connections, conversations, deliveries, now]);
}

export function RulesPanel({ channel, connections, conversations, deliveries, now }) {
  const metrics = useRuleMetrics({ channel, connections, conversations, deliveries, now });
  const rules = PLATFORM_RULES[channel] || [];
  return (
    <SettingsList>
      {rules.map((rule) => (
        <SettingRow
          key={rule.key}
          title={rule.title}
          description={rule.detail}
          control={
            <div className="flex max-w-[16rem] flex-col items-end gap-1 text-right">
              <Badge variant="info">{rule.enforcement}</Badge>
              <span className="text-xs tabular-nums text-text-secondary">{metrics[rule.key] ?? ""}</span>
            </div>
          }
        />
      ))}
    </SettingsList>
  );
}
