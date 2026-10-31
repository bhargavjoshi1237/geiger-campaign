"use client";

import React from "react";
import { Music2 } from "lucide-react";
import { SocialChannelScreen } from "./social/channel_screen";

// TikTok channel: connected accounts, health, platform rules, webhook and recent activity.
export function TiktokScreen() {
  return (
    <SocialChannelScreen
      channel="tiktok"
      title="TikTok"
      description="TikTok business accounts for direct messages, answered within TikTok's 48-hour reply window."
      icon={Music2}
    />
  );
}

export default TiktokScreen;
