"use client";

import React, { useState } from "react";
import { ShieldAlert, Download, Lock, AlertTriangle, Network, Clock } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SectionCard,
  SettingsList,
  SettingRow,
} from "@geiger/ui";
import { SaveChangesButton, useSettingsForm } from "./settings_form";

const DANGER_BUTTON =
  "text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-700 dark:hover:text-red-300";

const DEFAULTS = { require2fa: false, ipAllowlist: false, retention: "24" };

export function AdvancedSettingsScreen() {
  const { form, set, dirty, saving, save } = useSettingsForm(DEFAULTS);
  // Export is a one-off action, not a saved setting.
  const [exportRequested, setExportRequested] = useState(false);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Advanced"
        description="Power-user controls and workspace data options."
        actions={<SaveChangesButton dirty={dirty} saving={saving} onClick={save} />}
      />

      <div className="space-y-6">
        <SectionCard title="Data & security" description="Access rules and how long workspace data is kept.">
          <SettingsList>
            <SettingRow
              icon={Lock}
              title="Require 2FA for all members"
              description="Members must set up two-factor authentication to sign in."
              checked={form.require2fa}
              onCheckedChange={set("require2fa")}
            />
            <SettingRow
              icon={Network}
              title="IP allowlist"
              description="Restrict workspace access to approved IP ranges."
              checked={form.ipAllowlist}
              onCheckedChange={set("ipAllowlist")}
            />
            <SettingRow
              icon={Clock}
              title="Data retention"
              description="How long campaign and contact activity is stored."
              control={
                <Select value={form.retention} onValueChange={set("retention")}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12 months</SelectItem>
                    <SelectItem value="24">24 months</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
            <SettingRow
              icon={Download}
              title="Export data"
              description={
                exportRequested
                  ? "Export requested — we'll email you a download link."
                  : "Download a full archive of your workspace data."
              }
              control={
                <Button variant="outline" onClick={() => setExportRequested(true)} disabled={exportRequested}>
                  <Download className="h-4 w-4" /> {exportRequested ? "Requested" : "Request export"}
                </Button>
              }
            />
          </SettingsList>
        </SectionCard>

        <SectionCard
          title={
            <span className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" /> Danger zone
            </span>
          }
          description="Irreversible actions. Proceed with care."
          className="border-red-500/30 bg-red-500/5"
        >
          <SettingsList>
            <SettingRow
              title="Reset workspace data"
              description="Permanently delete all campaigns, contacts and reports. The workspace itself stays."
              control={
                <Button variant="ghost" onClick={() => {}} className={DANGER_BUTTON}>
                  <ShieldAlert className="h-4 w-4" /> Reset data
                </Button>
              }
            />
            <SettingRow
              title="Delete workspace"
              description="Permanently remove this workspace and everything in it. This cannot be undone."
              control={
                <Button variant="ghost" onClick={() => {}} className={DANGER_BUTTON}>
                  <AlertTriangle className="h-4 w-4" /> Delete workspace
                </Button>
              }
            />
          </SettingsList>
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default AdvancedSettingsScreen;
