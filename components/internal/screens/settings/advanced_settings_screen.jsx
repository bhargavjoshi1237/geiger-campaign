"use client";

import React, { useState } from "react";
import { ShieldAlert, Download, Lock, AlertTriangle } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function AdvancedSettingsScreen() {
  const [require2fa, setRequire2fa] = useState(false);
  const [ipAllowlist, setIpAllowlist] = useState(false);
  const [retention, setRetention] = useState("24");
  const [exportRequested, setExportRequested] = useState(false);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Advanced"
        description="Power-user controls and workspace data options."
      />

      <div className="space-y-4 border-t border-[#242424] pt-4">
        {/* Data & security */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#737373]" />
            <h2 className="text-sm font-semibold text-[#ededed]">Data & security</h2>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Require 2FA for all members</p>
              <p className="text-xs text-[#737373]">Members must set up two-factor authentication to sign in.</p>
            </div>
            <Switch checked={require2fa} onCheckedChange={setRequire2fa} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">IP allowlist</p>
              <p className="text-xs text-[#737373]">Restrict workspace access to approved IP ranges.</p>
            </div>
            <Switch checked={ipAllowlist} onCheckedChange={setIpAllowlist} />
          </div>

          <Field label="Data retention" hint="How long campaign and contact activity is stored.">
            <Select value={retention} onValueChange={setRetention}>
              <SelectTrigger className="sm:w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
                <SelectItem value="forever">Forever</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Export data</p>
              <p className="text-xs text-[#737373]">
                {exportRequested ? "Export requested — we'll email you a download link." : "Download a full archive of your workspace data."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setExportRequested(true)}
              disabled={exportRequested}
              className="h-9 border-[#2a2a2a] bg-[#202020] text-[#ededed] hover:bg-[#1a1a1a]"
            >
              <Download className="h-4 w-4" /> {exportRequested ? "Requested" : "Request export"}
            </Button>
          </div>
        </div>

        {/* Danger zone */}
        <div className="space-y-4 rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-semibold text-red-400">Danger zone</h2>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Reset workspace data</p>
              <p className="text-xs text-[#737373]">Permanently delete all campaigns, contacts and reports. The workspace itself stays.</p>
            </div>
            <Button
              variant="ghost"
              onClick={() => {}}
              className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <ShieldAlert className="h-4 w-4" /> Reset data
            </Button>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Delete workspace</p>
              <p className="text-xs text-[#737373]">Permanently remove this workspace and everything in it. This cannot be undone.</p>
            </div>
            <Button
              variant="ghost"
              onClick={() => {}}
              className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <AlertTriangle className="h-4 w-4" /> Delete workspace
            </Button>
          </div>
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default AdvancedSettingsScreen;
