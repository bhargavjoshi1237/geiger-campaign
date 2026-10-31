"use client";

import React from "react";
import { InboxWorkspace } from "./inbox_kit";

const CHANNELS = ["sms"];

// Two-way SMS: replies honour STOP opt-outs and show the segment count before sending.
export function SmsInboxScreen() {
  return (
    <InboxWorkspace
      title="SMS Inbox"
      description="Two-way text conversations with your contacts. STOP opt-outs block replies automatically."
      channels={CHANNELS}
      emptyTitle="No text conversations yet"
      emptyDescription="Connect an SMS number in Channels → SMS. Inbound texts and replies to your campaigns show up here."
    />
  );
}

export default SmsInboxScreen;
