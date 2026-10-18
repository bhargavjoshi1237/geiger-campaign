"use client";

import React, { Suspense } from "react";
import { SidebarInset, SidebarProvider } from "@geiger/ui";
import { ProjectSidebar } from "@/components/internal/sidebar/projects/project_sidebar";
import { Topbar } from "@/components/internal/topbar/topbar";
import { PlaceholderScreen } from "@/components/internal/screens/placeholder_screen";
import { getScreen } from "@/components/internal/screens/screen_registry";
import { projectNav } from "@/components/internal/sidebar/projects/sidebar_data";
import { ScreenErrorBoundary } from "@/components/landing/ScreenErrorBoundary";
import { PlaygroundWorkspaceUrlProvider } from "@/components/campaign-playground/PlaygroundWorkspaceUrl";
import { PlaygroundProjectProvider } from "@/context/project-context";
import { RbacProvider } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { usePlaygroundMode } from "@/lib/playground/use_playground_mode";
import { playgroundHandlers, playgroundRoutes } from "@/lib/playground/handlers";
import { PLAYGROUND_PROJECT } from "@/lib/playground/mode";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const MODE_OPTIONS = { routes: playgroundRoutes, basePath: BASE_PATH };

function findNavItem(title) {
  for (const item of projectNav) {
    if (item.title === title) return item;
    const sub = item.subItems?.find((s) => s.title === title);
    if (sub) return sub;
  }
  return { title };
}

// The registry screen for the tab, or the placeholder for a nav entry that has none (as on the project route).
function ScreenArea({ activeItem, Screen }) {
  return Screen ? <Screen /> : <PlaceholderScreen title={activeItem.title} icon={activeItem.icon} />;
}

// The project route's shell (app/project/[projectId]/[[...rest]]/page.js): same topbar, sidebar and screen registry.
function PlaygroundWorkspace() {
  const { tab, setTab } = useWorkspaceUrl();
  const Screen = getScreen(tab);
  const activeItem = findNavItem(tab);

  return (
    <div className="flex-col h-full w-full bg-background text-foreground font-sans overflow-hidden selection:bg-surface-strong flex">
      <SidebarProvider
        className="flex-col !flex h-full min-w-0"
        style={{ flexDirection: "column" }}
      >
        <Topbar />
        <div className="flex flex-1 overflow-hidden relative">
          <ProjectSidebar activeTab={tab} onTabChange={setTab} />
          <SidebarInset className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative border-none">
            <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-white/[0.02] blur-[120px] pointer-events-none rounded-full" />
            <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 w-full min-w-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <ScreenErrorBoundary key={tab} title={tab}>
                <ScreenArea activeItem={activeItem} Screen={Screen} />
              </ScreenErrorBoundary>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}

// Live copy of the Campaign workspace for the landing page, served at /playground: every real screen, with the data
// layer on an in-memory seeded database (lib/playground) and navigation in React state. Edits last until reload.
export function CampaignPlayground() {
  usePlaygroundMode(playgroundHandlers, MODE_OPTIONS);

  return (
    <Suspense fallback={null}>
      <PlaygroundWorkspaceUrlProvider projectId={PLAYGROUND_PROJECT.id}>
        <PlaygroundProjectProvider project={PLAYGROUND_PROJECT}>
          <RbacProvider>
            <PlaygroundWorkspace />
          </RbacProvider>
        </PlaygroundProjectProvider>
      </PlaygroundWorkspaceUrlProvider>
    </Suspense>
  );
}

export default CampaignPlayground;
