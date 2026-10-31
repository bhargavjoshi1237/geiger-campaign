"use client";

import React from "react";
import { InboxWorkspace } from "./inbox_kit";

// Unified inbox: every channel's DMs, texts, chats, emails and comments in one shared queue.
export function ConversationsScreen() {
  return (
    <InboxWorkspace
      title="Conversations"
      description="One shared inbox for email replies, texts, WhatsApp, Instagram, Messenger, comments and live chat."
      emptyTitle="No conversations yet"
      emptyDescription="Connect a channel in Channels — replies, DMs, comments and chats land here as soon as people write in."
    />
  );
}

export default ConversationsScreen;
