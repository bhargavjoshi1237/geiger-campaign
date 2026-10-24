"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ToggleGroup,
  ToggleGroupItem,
} from "@geiger/ui";
import { useTheme } from "next-themes";
import {
  CircleUserRound,
  Settings,
  Wallet,
  LogOut,
  Moon,
  Sun,
  UsersRound,
  LifeBuoy,
  MessageCircle,
  ShieldCheck,
  BookMarked,
  ExternalLink,
} from "lucide-react";
import { getUser, invalidateUserCache } from "@/lib/supabase/user";
import { createClient } from "@/lib/supabase/client";
import { isPlaygroundActive } from "@/lib/playground/mode";
import { useOptionalProject } from "@/context/project-context";
import { tabToSlug } from "@/lib/workspace/tabs";

const itemBaseStyle =
  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm cursor-default transition-colors outline-none";

const itemHoverStyle = "hover:bg-surface-active focus:bg-surface-active text-muted-foreground hover:text-foreground focus:text-foreground";

// The session is geiger-dash's (it serves this app under /campaign and owns sign-in), so account routes live there.
// Plain <a> keeps them at the domain root; next/link would prefix this app's basePath.
export function ProfileDropdown({ children }) {
  const [user, setUser] = useState(null);
  const { theme, setTheme } = useTheme();
  const project = useOptionalProject()?.project ?? null;

  useEffect(() => {
    getUser().then((u) => {
      if (u) setUser(u);
    });
  }, []);

  // The landing playground's seeded user isn't a suite account, so its account links stay inert.
  const live = !isPlaygroundActive();
  const parentHref = (path) => (live ? path : undefined);

  const pfpUrl = user?.avatarUrl || null;

  const displayName = user?.name || "User";
  const displayEmail = user?.email || "user@email.com";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const profileHref = user?.id ? `/profile/${user.id}` : "/profile";
  const organizationHref = project?.organization_id ? `/org/${project.organization_id}` : "/org";
  const projectBase = live && project?.id ? `/project/${project.id}` : null;

  const handleSignOut = async () => {
    if (!live) return;
    try {
      await createClient().auth.signOut();
    } catch (e) {
      console.error("[profile] sign out", e);
    } finally {
      invalidateUserCache();
      // A full navigation to geiger-dash's login, outside this app's basePath.
      window.location.href = "/login";
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children || (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Account menu"
            className="p-0 rounded-full border border-border hover:border-border-strong overflow-hidden ml-1 transition-colors"
          >
            <Avatar className="size-full">
              {pfpUrl && (
                <AvatarImage src={pfpUrl} alt={displayName} />
              )}
              <AvatarFallback className="bg-surface-card text-muted-foreground text-[10px] font-semibold border-0">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-72 p-0 rounded-xl border border-border bg-background text-foreground shadow-xl"
        sideOffset={8}
        align="end"
      >
        <div className="p-4 pb-3">
          <DropdownMenuLabel className="p-0">
            <div className="flex items-center gap-3">
              <Avatar className="size-10 border border-border">
                {pfpUrl && (
                  <AvatarImage src={pfpUrl} alt={displayName} />
                )}
                <AvatarFallback className="bg-surface-card text-muted-foreground text-xs font-semibold border-0">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold text-foreground truncate">
                  {displayName}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {displayEmail}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
        </div>

        <DropdownMenuSeparator className="bg-surface-hover mx-0" />

        <div className="p-1.5">
          <DropdownMenuGroup>
            <DropdownMenuItem asChild className={`${itemBaseStyle} ${itemHoverStyle}`}>
              <a href={parentHref(profileHref)}>
                <CircleUserRound className="size-4 text-muted-foreground" />
                <span>Profile</span>
              </a>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className={`${itemBaseStyle} ${itemHoverStyle}`}>
              <a href={parentHref(organizationHref)}>
                <UsersRound className="size-4 text-muted-foreground" />
                <span>Organization Settings</span>
              </a>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className={`${itemBaseStyle} ${itemHoverStyle}`}>
              <a href={parentHref("/billing")}>
                <Wallet className="size-4 text-muted-foreground" />
                <span>Billing & Plans</span>
              </a>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="bg-surface-hover my-1" />

          <DropdownMenuGroup>
            <DropdownMenuItem className="hover:bg-transparent focus:bg-transparent p-2 cursor-default">
              <ToggleGroup
                type="single"
                value={theme}
                onValueChange={(value) => { if (value) setTheme(value); }}
                className="bg-surface-subtle border border-border flex items-center justify-evenly rounded-lg p-0.5 w-full"
              >
                <ToggleGroupItem
                  value="light"
                  aria-label="Light theme"
                  className="data-[state=on]:bg-surface-active data-[state=on]:text-foreground text-muted-foreground rounded-md hover:bg-surface-hover dark:hover:bg-surface-card hover:text-foreground px-3 h-7 text-xs gap-1.5 flex-1 justify-center"
                >
                  <Sun className="size-3.5" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="dark"
                  aria-label="Dark theme"
                  className="data-[state=on]:bg-surface-active data-[state=on]:text-foreground text-muted-foreground rounded-md hover:bg-surface-hover dark:hover:bg-surface-card hover:text-foreground px-3 h-7 text-xs gap-1.5 flex-1 justify-center"
                >
                  <Moon className="size-3.5" />
                </ToggleGroupItem>
              </ToggleGroup>
            </DropdownMenuItem>

            {/* Project-scoped settings tabs — nothing to point at without an open project. */}
            {projectBase ? (
              <>
                <DropdownMenuItem asChild className={`${itemBaseStyle} ${itemHoverStyle}`}>
                  <Link href={`${projectBase}/${tabToSlug("General")}`}>
                    <Settings className="size-4 text-muted-foreground" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild className={`${itemBaseStyle} ${itemHoverStyle}`}>
                  <Link href={`${projectBase}/${tabToSlug("Team & Roles")}`}>
                    <ShieldCheck className="size-4 text-muted-foreground" />
                    <span>Security</span>
                  </Link>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="bg-surface-hover my-1" />

          <DropdownMenuGroup>
            <DropdownMenuItem asChild className={`${itemBaseStyle} ${itemHoverStyle}`}>
              <a href="/docs">
                <BookMarked className="size-4 text-muted-foreground" />
                <span>Documentation</span>
                <ExternalLink className="size-3 ml-auto text-text-secondary" />
              </a>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className={`${itemBaseStyle} ${itemHoverStyle}`}>
              <a href="mailto:feedback@geiger.studio">
                <MessageCircle className="size-4 text-muted-foreground" />
                <span>Send Feedback</span>
              </a>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className={`${itemBaseStyle} ${itemHoverStyle}`}>
              <a href="mailto:help@geiger.studio">
                <LifeBuoy className="size-4 text-muted-foreground" />
                <span>Help & Support</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={handleSignOut}
              className={`${itemBaseStyle} text-muted-foreground hover:bg-red-500/10 focus:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus:text-red-600 dark:focus:text-red-400 group`}
            >
              <LogOut className="size-4 group-hover:text-red-600 dark:group-hover:text-red-400 group-focus:text-red-600 dark:group-focus:text-red-400" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </div>

        <div className="px-4 py-2.5 border-t border-border">
          <div className="flex items-center justify-between text-[11px] text-text-secondary">
            <span>Campaign v1.0.0</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Online
            </span>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
