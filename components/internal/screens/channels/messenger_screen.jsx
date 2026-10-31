"use client";

import React from "react";
import { MessageSquare } from "lucide-react";
import { SocialChannelScreen } from "./social/channel_screen";

// Messenger channel: connected accounts, health, platform rules, webhook and recent activity.
export function MessengerScreen() {
  return (
    <SocialChannelScreen
      channel="messenger"
      title="Messenger"
      description="Facebook Pages for Messenger conversations and Page comments, sent within Meta's messaging rules."
      icon={MessageSquare}
    />
  );
}

export default MessengerScreen;
