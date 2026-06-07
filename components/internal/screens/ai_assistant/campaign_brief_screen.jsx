"use client";

import React, { useState } from "react";
import {
  Sparkles, RotateCcw, Target, Users, Mail, Lightbulb, Clock, MousePointerClick,
} from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const OBJECTIVES = ["Awareness", "Acquisition", "Retention", "Re-engagement"];
const AUDIENCES = ["All subscribers", "New leads", "Customers", "Churn risk"];
const CHANNELS = ["Email", "SMS", "Multi-channel"];
const TONES = ["Friendly", "Professional", "Bold", "Playful"];

// Realistic, input-derived brief content.
function buildBrief({ objective, audience, channel, tone, message }) {
  const goals = {
    Awareness: "Introduce the brand to a wider audience and grow top-of-funnel recognition.",
    Acquisition: "Convert qualified prospects into first-time customers with a focused offer.",
    Retention: "Keep existing customers engaged and increase repeat purchase frequency.",
    "Re-engagement": "Win back dormant contacts and clean inactive segments from the list.",
  };
  const sendTimes = {
    Email: "Tuesday 10:00 AM in each recipient's local time zone.",
    SMS: "Thursday 12:30 PM local — within standard messaging hours.",
    "Multi-channel": "Email Tuesday 10:00 AM, with an SMS nudge Thursday 11:00 AM to non-openers.",
  };
  const ctas = {
    Awareness: "See what's new",
    Acquisition: "Claim your offer",
    Retention: "Unlock your reward",
    "Re-engagement": "We miss you — come back",
  };
  return {
    goal: goals[objective],
    audience: `${audience} — prioritizing contacts with recent activity and a valid, opted-in address.`,
    subjects: [
      `${tone === "Playful" ? "Psst… " : ""}A ${objective.toLowerCase()} update made for you`,
      `Your next step with us — ${channel === "SMS" ? "in one tap" : "inside"}`,
      `${audience === "Customers" ? "Because you're a customer" : "Just for you"}: don't miss this`,
    ],
    talkingPoints: [
      message?.trim()
        ? `Lead with the core message: "${message.trim()}"`
        : "Lead with a single, clear value proposition.",
      `Match a ${tone.toLowerCase()} tone throughout copy and visuals.`,
      `Speak directly to ${audience.toLowerCase()} and their current lifecycle stage.`,
      "Include one focused call-to-action above the fold.",
      "Add social proof or a concrete benefit to support the ask.",
    ],
    sendTime: sendTimes[channel],
    cta: ctas[objective],
  };
}

export function CampaignBriefScreen() {
  const [objective, setObjective] = useState("Acquisition");
  const [audience, setAudience] = useState("New leads");
  const [channel, setChannel] = useState("Email");
  const [tone, setTone] = useState("Friendly");
  const [message, setMessage] = useState("");
  const [brief, setBrief] = useState(null);

  const generate = () =>
    setBrief(buildBrief({ objective, audience, channel, tone, message }));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Campaign Brief"
        description="Turn a few inputs into a structured, ready-to-run campaign brief."
      />

      <div className="grid grid-cols-1 gap-4 border-t border-[#242424] pt-4 lg:grid-cols-[380px_1fr]">
        {/* Config */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <Field label="Objective">
            <Select value={objective} onValueChange={setObjective}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Audience">
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AUDIENCES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Channel">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tone">
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Key message" htmlFor="cb-message" hint="What's the one thing this campaign should say?">
            <Textarea
              id="cb-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Our spring collection is 25% off for the next 48 hours."
              className="min-h-24 bg-[#161616] border-[#2a2a2a]"
            />
          </Field>
          <Button onClick={generate} className="h-9 w-full bg-white text-black hover:bg-[#e5e5e5]">
            <Sparkles className="h-4 w-4" /> {brief ? "Regenerate brief" : "Generate brief"}
          </Button>
        </div>

        {/* Result */}
        {!brief ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#2a2a2a] bg-[#1a1a1a] py-20 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
              <Sparkles className="h-6 w-6" />
            </span>
            <p className="mt-4 text-sm text-[#a3a3a3]">Fill in the details and generate your brief.</p>
            <p className="mt-1 text-xs text-[#737373]">Your structured campaign brief will appear here.</p>
          </div>
        ) : (
          <div className="space-y-5 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#ededed]">Generated campaign brief</h2>
              <Button onClick={generate} size="sm" variant="outline" className="h-8 border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a]">
                <RotateCcw className="h-3.5 w-3.5" /> Regenerate
              </Button>
            </div>

            <Section icon={Target} title="Goal">
              <p className="text-sm text-[#a3a3a3]">{brief.goal}</p>
            </Section>
            <Section icon={Users} title="Target audience">
              <p className="text-sm text-[#a3a3a3]">{brief.audience}</p>
            </Section>
            <Section icon={Mail} title="Suggested subject lines">
              <ul className="space-y-1.5">
                {brief.subjects.map((s) => (
                  <li key={s} className="flex gap-2 text-sm text-[#a3a3a3]">
                    <span className="text-[#737373]">•</span><span>{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
            <Section icon={Lightbulb} title="Key talking points">
              <ul className="space-y-1.5">
                {brief.talkingPoints.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-[#a3a3a3]">
                    <span className="text-[#737373]">•</span><span>{p}</span>
                  </li>
                ))}
              </ul>
            </Section>
            <Section icon={Clock} title="Recommended send time">
              <p className="text-sm text-[#a3a3a3]">{brief.sendTime}</p>
            </Section>
            <Section icon={MousePointerClick} title="Call to action">
              <span className="inline-flex rounded-md border border-[#2a2a2a] bg-[#202020] px-3 py-1.5 text-sm font-medium text-[#ededed]">
                {brief.cta}
              </span>
            </Section>
          </div>
        )}
      </div>
    </MainScreenWrapper>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="border-t border-[#242424] pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#737373]" />
        <h3 className="text-sm font-semibold text-[#ededed]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default CampaignBriefScreen;
