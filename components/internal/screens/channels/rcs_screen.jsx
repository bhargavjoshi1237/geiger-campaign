"use client";

import React from "react";
import { MessageSquareText } from "lucide-react";
import { SocialChannelScreen } from "./social/channel_screen";

// RCS channel: connected accounts, health, platform rules, webhook and recent activity.
export function RcsScreen() {
  return (
    <SocialChannelScreen
      channel="rcs"
      title="RCS"
      description="Google RBM agents for rich, branded messages to phones that support RCS."
      icon={MessageSquareText}
    />
  );
}

export default RcsScreen;
