"use client";

import React from "react";
import { AtSign } from "lucide-react";
import { ChatAutomationsScreen } from "./automation_screen";

// Story replies and story mentions on Instagram, each opening a 24-hour window for one automated reply.
export function StoryMentionsScreen() {
  return (
    <ChatAutomationsScreen
      kinds={["story_reply", "story_mention"]}
      title="Story & Mentions"
      description="Answer people who reply to your stories, and thank people who mention you in theirs."
      createLabel="New story automation"
      icon={AtSign}
      emptyTitle="No story automations yet"
      emptyDescription="Reply to story replies by keyword, or thank everyone who mentions your account. Instagram only."
    />
  );
}

export default StoryMentionsScreen;
