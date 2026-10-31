"use client";

import React from "react";
import { Hash } from "lucide-react";
import { ChatAutomationsScreen } from "./automation_screen";

// Keyword triggers plus the conversation-level replies: welcome, default reply and ref-link referrals.
export function KeywordTriggersScreen() {
  return (
    <ChatAutomationsScreen
      kinds={["keyword", "welcome", "default_reply", "referral"]}
      title="Keyword Triggers"
      description="Answer DMs that contain a keyword, greet new conversations, and catch everything nothing else answered."
      createLabel="New trigger"
      icon={Hash}
      emptyTitle="No keyword triggers yet"
      emptyDescription="Add a keyword like PRICE or LINK and the reply it sends, on any connected chat channel."
    />
  );
}

export default KeywordTriggersScreen;
