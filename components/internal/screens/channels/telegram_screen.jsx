"use client";

import React from "react";
import { Send } from "lucide-react";
import { SocialChannelScreen } from "./social/channel_screen";

// Telegram channel: connected accounts, health, platform rules, webhook and recent activity.
export function TelegramScreen() {
  return (
    <SocialChannelScreen
      channel="telegram"
      title="Telegram"
      description="Telegram bots for one-to-one chats. People reach you by starting the bot; groups and channels live in Communities."
      icon={Send}
    />
  );
}

export default TelegramScreen;
