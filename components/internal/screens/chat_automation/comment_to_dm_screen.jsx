"use client";

import React from "react";
import { Reply } from "lucide-react";
import { ChatAutomationsScreen } from "./automation_screen";

// Comment-to-DM: a keyword comment on a post, reel or ad gets a public reply and one private DM.
export function CommentToDmScreen() {
  return (
    <ChatAutomationsScreen
      kinds={["comment_to_dm"]}
      title="Comment-to-DM"
      description="Reply publicly to comments on your posts and ads, and send each commenter one private DM."
      createLabel="New comment-to-DM"
      icon={Reply}
      emptyTitle="No comment automations yet"
      emptyDescription="Pick a post, choose the keyword people comment, and write the DM they get back. Instagram and Facebook only."
    />
  );
}

export default CommentToDmScreen;
