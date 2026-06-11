"use client";

import React, { useState } from "react";
import { Building2, Link2, Clock, Languages, Check } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function GeneralSettingsScreen() {
  const [name, setName] = useState("Geiger Studio");
  const [subdomain, setSubdomain] = useState("acme");
  const [timezone, setTimezone] = useState("America/New_York");
  const [language, setLanguage] = useState("en");
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [productUpdates, setProductUpdates] = useState(true);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="General"
        description="Core settings for your Campaign workspace."
      />

      <div className="space-y-4 border-t border-surface-active pt-4">
        {/* Workspace identity */}
        <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-foreground">Workspace</h2>
          </div>

          <Field label="Workspace name" htmlFor="ws-name">
            <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} className="bg-background border-border" />
          </Field>

          <Field label="Workspace URL" hint="Your public subdomain. Lowercase letters, numbers and hyphens only.">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-muted-foreground">
                <Link2 className="h-4 w-4 text-text-secondary" />
                geiger.studio/{subdomain || "…"}
              </span>
              <Input
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                placeholder="acme"
                className="max-w-[180px] bg-background border-border"
              />
            </div>
          </Field>
        </div>

        {/* Localization */}
        <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-foreground">Localization</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Timezone">
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Los_Angeles">(GMT-08:00) Pacific Time</SelectItem>
                  <SelectItem value="America/New_York">(GMT-05:00) Eastern Time</SelectItem>
                  <SelectItem value="Europe/London">(GMT+00:00) London</SelectItem>
                  <SelectItem value="Europe/Berlin">(GMT+01:00) Berlin</SelectItem>
                  <SelectItem value="Asia/Tokyo">(GMT+09:00) Tokyo</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Default language">
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English (US)</SelectItem>
                  <SelectItem value="en-GB">English (UK)</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="ja">日本語</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Date format">
              <Select value={dateFormat} onValueChange={setDateFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="DD MMM YYYY">DD MMM YYYY</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        {/* Notifications */}
        <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-5">
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Weekly summary email</p>
              <p className="text-xs text-text-secondary">A digest of campaign performance every Monday.</p>
            </div>
            <Switch checked={weeklySummary} onCheckedChange={setWeeklySummary} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Product update announcements</p>
              <p className="text-xs text-text-secondary">Occasional emails about new features and changes.</p>
            </div>
            <Switch checked={productUpdates} onCheckedChange={setProductUpdates} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end">
          <Button className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Check className="h-4 w-4" /> Save changes
          </Button>
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default GeneralSettingsScreen;
