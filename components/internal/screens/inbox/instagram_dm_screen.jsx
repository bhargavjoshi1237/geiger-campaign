"use client";

import React from "react";
import { InboxWorkspace } from "./inbox_kit";

const CHANNELS = ["instagram"];

// Instagram DMs, including story replies and mentions; Meta's 24h window and 7-day human agent tag apply.
export function InstagramDmScreen() {
  return (
    <InboxWorkspace
      title="Instagram DM"
      description="Direct messages, story replies and mentions. Replies follow Meta's 24-hour window, extended to 7 days for human agents."
      channels={CHANNELS}
      kind="dm"
      emptyTitle="No Instagram DMs yet"
      emptyDescription="Connect an Instagram professional account in Channels → Instagram. New DMs and story replies arrive here."
    />
  );
}

export default InstagramDmScreen;
