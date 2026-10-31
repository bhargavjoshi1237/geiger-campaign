"use client";

import React from "react";
import { InboxWorkspace } from "./inbox_kit";

const CHANNELS = ["instagram", "messenger"];

// Comments on organic posts and ads (Instagram + Facebook) with post context: reply publicly, send one
// private reply, hide or delete.
export function CommentInboxScreen() {
  return (
    <InboxWorkspace
      title="Comment Inbox"
      description="Comments on your Instagram and Facebook posts and ads. Reply publicly, send one private DM, or hide what shouldn't stay up."
      channels={CHANNELS}
      kind="comment"
      emptyTitle="No comments yet"
      emptyDescription="Connect Instagram or a Facebook Page in Channels. Comments on posts and ads arrive here with the post they're on."
    />
  );
}

export default CommentInboxScreen;
