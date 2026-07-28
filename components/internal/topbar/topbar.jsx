"use client";

import React from "react";
import { Bell } from "lucide-react";
import { Topbar as SuiteTopbar, Button, SidebarTrigger } from "@geiger/ui";
import { NotificationsDropdown } from "./dialogue/notifications_dropdown";
import { ProfileDropdown } from "./dialogue/profile_dropdown";
import { SupabaseActivityLine } from "./supabase_activity_line";

// Suite topbar from @geiger/ui, wired with this product's name + data-bound slots.
export function Topbar() {
  return (
    <SuiteTopbar
      label="Campaign"
      searchPlaceholder="Search..."
      sidebarTrigger={
        <SidebarTrigger className="md:hidden -ml-2 text-foreground" />
      }
      notifications={
        <NotificationsDropdown>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Notifications"
            className="w-8 h-8 rounded-full border border-transparent hover:bg-surface-hover hidden items-center justify-center transition-colors text-muted-foreground hover:text-foreground relative sm:flex"
          >
            <Bell className="w-[18px] h-[18px]" strokeWidth={2} />
          </Button>
        </NotificationsDropdown>
      }
      profile={<ProfileDropdown />}
      activity={<SupabaseActivityLine />}
    />
  );
}
