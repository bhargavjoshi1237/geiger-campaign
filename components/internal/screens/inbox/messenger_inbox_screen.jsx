"use client";

import React from "react";
import { InboxWorkspace } from "./inbox_kit";

const CHANNELS = ["messenger"];

// Facebook Page messages over Messenger; same 24h window + HUMAN_AGENT tag rules as Instagram.
export function MessengerInboxScreen() {
  return (
    <InboxWorkspace
      title="Messenger Inbox"
      description="Messages to your Facebook Page. Replies follow Meta's 24-hour window, extended to 7 days for human agents."
      channels={CHANNELS}
      kind="dm"
      emptyTitle="No Messenger conversations yet"
      emptyDescription="Connect a Facebook Page in Channels → Messenger. Messages people send your Page land here."
    />
  );
}

export default MessengerInboxScreen;
