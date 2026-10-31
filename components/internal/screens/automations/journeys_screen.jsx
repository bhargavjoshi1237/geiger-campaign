"use client";

import React from "react";
import { AutomationListScreen } from "./automation_list";

// Journeys: cross-channel paths on the same engine and canvas, kind = "journey".
export function JourneysScreen() {
  return <AutomationListScreen kind="journey" />;
}

export default JourneysScreen;
