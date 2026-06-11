"use client";

import React, { useState } from "react";
import { ProjectSidebar } from "@/components/internal/sidebar/projects/project_sidebar";
import { ProjectTopbar } from "@/components/internal/topbar/projects/topbar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { PlaceholderScreen } from "@/components/internal/screens/placeholder_screen";
import { CampaignOverviewScreen } from "@/components/internal/screens/overview/campaign_overview";
import { projectNav } from "@/components/internal/sidebar/projects/sidebar_data";

// Self-contained, interactive copy of the Campaign workspace for embedding as a
// landing-page demo. Mirrors app/home/page.js but drives navigation through
// local state (no routing / URL params) and fills its parent box (h-full)
// instead of the full viewport, so it can live inside a framed showcase.
export function CampaignPlayground() {
  const [currentTab, setCurrentTab] = useState(projectNav[0].title);

  const activeItem =
    projectNav.find((item) => item.title === currentTab) || projectNav[0];

  return (
    <div className="flex-col h-full w-full bg-background text-foreground font-sans overflow-hidden selection:bg-surface-strong flex">
      <SidebarProvider
        className="flex-col !flex h-full min-w-0"
        style={{ flexDirection: "column" }}
      >
        <ProjectTopbar name="Campaign" />
        <div className="flex flex-1 overflow-hidden relative">
          <ProjectSidebar activeTab={currentTab} onTabChange={setCurrentTab} />
          <SidebarInset className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative border-none">
            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full" />
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 w-full min-w-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {currentTab === "Overview" ? (
                <CampaignOverviewScreen />
              ) : (
                <PlaceholderScreen title={activeItem.title} icon={activeItem.icon} />
              )}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

export default CampaignPlayground;
