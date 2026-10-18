"use client";

import React from "react";
import { Link2, Mail, Megaphone } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SectionCard,
  SettingsList,
  SettingRow,
  Field,
} from "@geiger/ui";
import { SaveChangesButton, useSettingsForm } from "./settings_form";

const DEFAULTS = {
  name: "Halcyon Studio",
  subdomain: "halcyon",
  timezone: "America/New_York",
  language: "en",
  dateFormat: "MM/DD/YYYY",
  weeklySummary: true,
  productUpdates: true,
};

export function GeneralSettingsScreen() {
  const { form, set, dirty, saving, save } = useSettingsForm(DEFAULTS);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="General"
        description="Core settings for your Campaign workspace."
        actions={<SaveChangesButton dirty={dirty} saving={saving} onClick={save} />}
      />

      <div className="space-y-6">
        <SectionCard title="Workspace" description="How your workspace is named and addressed.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Workspace name" htmlFor="ws-name">
              <Input id="ws-name" value={form.name} onChange={(e) => set("name")(e.target.value)} />
            </Field>

            <Field
              label="Workspace URL"
              htmlFor="ws-subdomain"
              hint="Your public subdomain. Lowercase letters, numbers and hyphens only."
            >
              <div className="flex items-center gap-2">
                <span className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-surface-card px-3 py-2 font-mono text-sm text-muted-foreground">
                  <Link2 className="h-4 w-4 text-text-secondary" />
                  geiger.studio/
                </span>
                <Input
                  id="ws-subdomain"
                  value={form.subdomain}
                  onChange={(e) => set("subdomain")(e.target.value)}
                  placeholder="acme"
                  className="min-w-0"
                />
              </div>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Localization" description="Defaults for dates, times and language across the workspace.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Timezone">
              <Select value={form.timezone} onValueChange={set("timezone")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
              <Select value={form.language} onValueChange={set("language")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
              <Select value={form.dateFormat} onValueChange={set("dateFormat")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="DD MMM YYYY">DD MMM YYYY</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Notifications" description="Workspace emails sent to you.">
          <SettingsList>
            <SettingRow
              icon={Mail}
              title="Weekly summary email"
              description="A digest of campaign performance every Monday."
              checked={form.weeklySummary}
              onCheckedChange={set("weeklySummary")}
            />
            <SettingRow
              icon={Megaphone}
              title="Product update announcements"
              description="Occasional emails about new features and changes."
              checked={form.productUpdates}
              onCheckedChange={set("productUpdates")}
            />
          </SettingsList>
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default GeneralSettingsScreen;
