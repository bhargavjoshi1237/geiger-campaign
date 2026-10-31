"use client";

import React from "react";
import { AutomationListScreen } from "./automation_list";

// Workflows: multi-step automations (list + canvas editor), kind = "workflow".
export function WorkflowsScreen() {
  return <AutomationListScreen kind="workflow" />;
}

export default WorkflowsScreen;
