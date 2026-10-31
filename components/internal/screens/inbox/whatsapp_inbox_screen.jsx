"use client";

import React from "react";
import { InboxWorkspace } from "./inbox_kit";

const CHANNELS = ["whatsapp"];

// WhatsApp: free-form replies inside the 24-hour service window, approved templates outside it.
export function WhatsappInboxScreen() {
  return (
    <InboxWorkspace
      title="WhatsApp Inbox"
      description="Reply free-form inside the 24-hour service window; outside it, WhatsApp only allows an approved template."
      channels={CHANNELS}
      kind="dm"
      emptyTitle="No WhatsApp conversations yet"
      emptyDescription="Connect a WhatsApp Business number in Channels → WhatsApp. Customer messages land here with the window shown on every thread."
    />
  );
}

export default WhatsappInboxScreen;
