"use client";

import React from "react";
import { Hammer, Sparkles } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@geiger/ui";

// Header copy for nav entries that are scaffolded but not built yet.
const ROADMAP_COPY = {
  // Automations
  "Social Triggers": "Start automations when someone follows, comments, mentions or messages one of your social accounts.",

  // Channels
  Instagram: "Connect Instagram Business accounts to send and receive direct messages.",
  Messenger: "Reach Facebook Page followers through Messenger conversations.",
  Telegram: "Run a Telegram bot to message subscribers and power automated chats.",
  TikTok: "Connect TikTok Business to reply to messages and comments in one place.",
  RCS: "Send rich, branded RCS business messages with carousels and suggested replies.",

  // Chat Automation
  "Comment-to-DM": "Auto-reply to post comments with a private message that starts a conversation.",
  "Keyword Triggers": "Kick off chat flows when an incoming message contains a keyword you choose.",
  "Story & Mentions": "Respond automatically when people mention you or reply to your stories.",
  "DM Flows": "Design branching direct-message conversations with buttons, questions and handoffs.",
  Sequences: "Drip timed follow-up messages to contacts who opt in to a chat channel.",
  "AI Agent": "Let an AI agent answer common questions and qualify leads before a human steps in.",
  "Entry Points": "Create QR codes, ref links and widgets that open a chat with the right flow.",
  "Handover Rules": "Decide when a conversation moves from automation to a person on your team.",

  // Broadcasts
  "Broadcast Campaigns": "Send one-to-many WhatsApp, SMS and RCS broadcasts to opted-in audiences.",
  "Message Templates": "Draft and submit pre-approved message templates for each messaging channel.",
  "Opt-In & Consent": "Collect, record and honour messaging consent across every channel.",
  "Sender Registry": "Register phone numbers, sender IDs and brands with carriers and providers.",
  "Quality & Limits": "Monitor sender quality ratings and the messaging tiers that cap your volume.",
  "Message Costs": "Track per-message spend by channel, country and conversation category.",

  // Social
  "Social Accounts": "Connect the social profiles your team publishes from and listens to.",
  Publishing: "Review the queue of scheduled, published and failed social posts.",
  "Post Composer": "Write a post once and tailor it for every connected network.",
  "Social Calendar": "Plan social content across networks on a shared calendar.",
  Comments: "Read and reply to comments from every connected social account.",
  "Moderation Rules": "Hide, flag or auto-reply to comments that match the rules you set.",
  Listening: "Track mentions of your brand, competitors and keywords across social networks.",
  "Social Analytics": "Measure reach, engagement and follower growth for every social account.",
  "Link in Bio": "Build a mobile landing page of links for your social profiles.",

  // Communities
  "WhatsApp Channels": "Broadcast updates to followers of your WhatsApp Channels.",
  "Instagram Broadcasts": "Share updates with followers in Instagram broadcast channels.",
  "Telegram Channels": "Publish to Telegram channels and manage their subscribers.",
  Groups: "Manage community groups, admins and membership rules in one place.",
  "Member Growth": "See how your communities grow and where new members come from.",

  // Ads
  "Ad Campaigns": "Launch and monitor paid campaigns across your connected ad platforms.",
  "Click-to-Message": "Run ads that open a WhatsApp, Messenger or Instagram conversation.",
  "Lead Ads": "Pull leads from instant-form ads straight into your audience.",
  "Audience Sync": "Keep segments in sync with custom audiences on your ad platforms.",
  "Conversions API": "Send server-side conversion events back to ad platforms for better attribution.",
  "Creative Library": "Store and reuse ad images, videos and copy across campaigns.",
  "Ad Comments": "Moderate and reply to comments on your running ads.",

  // Creators
  "Creator Discovery": "Find creators who match your audience, niche and budget.",
  Outreach: "Contact creators and track every pitch from first message to signed deal.",
  Collaborations: "Manage briefs, deliverables and approvals for each creator partnership.",
  "UGC Library": "Collect, tag and get rights to user-generated content you can reuse.",
  "Affiliate Links": "Give creators tracked links and codes, and see the sales they drive.",
  Payouts: "Pay creators and affiliates for completed work and earned commissions.",

  // Inbox
  "Instagram DM": "Reply to Instagram direct messages from the shared inbox.",
  "Messenger Inbox": "Handle Facebook Messenger conversations alongside your other channels.",
  "Comment Inbox": "Work through social and ad comments as conversations your team can assign.",
  Assignments: "Route conversations to teammates and track who owns each one.",
};

// Designed fallback for nav entries without a registered screen (matches Geiger Events).
export function ComingSoonScreen({ title = "Screen", description }) {
  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={title}
        description={
          description ||
          ROADMAP_COPY[title] ||
          `The ${title} screen is part of the Geiger Campaign roadmap and will be built out next.`
        }
      />

      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-background px-6 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-subtle text-muted-foreground">
          <Hammer className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-foreground">
            {title} is on the way
          </p>
          <p className="mx-auto max-w-md text-sm text-text-secondary">
            This area is scaffolded into the navigation. Its dedicated tools,
            tables, and dialogs are being implemented one area at a time to keep
            the experience consistent across the suite.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Coming soon
        </span>
      </div>
    </MainScreenWrapper>
  );
}

export default ComingSoonScreen;
