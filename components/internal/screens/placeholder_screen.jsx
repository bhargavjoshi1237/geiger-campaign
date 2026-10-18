"use client";

import React from "react";
import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@geiger/ui";
import { SecondaryScreenWrapper } from "@/components/internal/shared/screen_wrappers";

// Fallback for nav entries without a registered screen.
export function PlaceholderScreen({ title = "Overview", description, icon: Icon = LayoutDashboard }) {
  return (
    <SecondaryScreenWrapper>
      <EmptyState
        icon={Icon}
        title={title}
        description={description || "This section is coming soon."}
        className="rounded-xl border border-border bg-surface-subtle"
      />
    </SecondaryScreenWrapper>
  );
}
