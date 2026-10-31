"use client";

import React from "react";
import { Camera } from "lucide-react";
import { SocialChannelScreen } from "./social/channel_screen";

// Instagram channel: connected accounts, health, platform rules, webhook and recent activity.
export function InstagramScreen() {
  return (
    <SocialChannelScreen
      channel="instagram"
      title="Instagram"
      description="Instagram professional accounts for DMs, comments, story replies and mentions — with the 24-hour window enforced."
      icon={Camera}
    />
  );
}

export default InstagramScreen;
