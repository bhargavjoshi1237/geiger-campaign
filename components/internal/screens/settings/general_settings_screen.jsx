"use client";

import React, { useEffect, useState } from "react";
import { Gauge, Lock, Moon } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Field,
  Input,
  LogoLoading,
  ScreenHeader,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  Switch,
} from "@geiger/ui";
import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { CURRENCY_OPTIONS, LOCALE_OPTIONS, TIMEZONE_OPTIONS, isValidEmail, isValidTime } from "@/lib/settings/defaults";
import { getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/supabase/workspace_settings";
import { getUser } from "@/lib/supabase/user";
import { SaveChangesButton, useSettingsForm } from "./settings_form";

const EMPTY = {
  name: "",
  timezone: "UTC",
  locale: "en-US",
  currency: "USD",
  fromName: "",
  fromEmail: "",
  replyTo: "",
  quietEnabled: false,
  quietStart: "21:00",
  quietEnd: "08:00",
  capEnabled: false,
  weeklyFrequencyCap: "3",
};

function toForm(settings, projectName) {
  const { general, sending } = settings;
  return {
    name: general.name || projectName || "",
    timezone: general.timezone,
    locale: general.locale,
    currency: general.currency,
    fromName: sending.fromName,
    fromEmail: sending.fromEmail,
    replyTo: sending.replyTo,
    quietEnabled: Boolean(sending.quietHours),
    quietStart: sending.quietHours?.start || "21:00",
    quietEnd: sending.quietHours?.end || "08:00",
    capEnabled: Boolean(sending.weeklyFrequencyCap),
    weeklyFrequencyCap: String(sending.weeklyFrequencyCap || 3),
  };
}

function validate(form) {
  if (!form.name.trim()) return "Give the workspace a name.";
  if (form.fromEmail && !isValidEmail(form.fromEmail)) return "The default from address isn't a valid email.";
  if (form.replyTo && !isValidEmail(form.replyTo)) return "The reply-to address isn't a valid email.";
  if (form.quietEnabled && (!isValidTime(form.quietStart) || !isValidTime(form.quietEnd))) return "Quiet hours need a start and end time.";
  if (form.quietEnabled && form.quietStart === form.quietEnd) return "Quiet hours can't start and end at the same time.";
  const cap = Number(form.weeklyFrequencyCap);
  if (form.capEnabled && (!Number.isInteger(cap) || cap < 1 || cap > 50)) return "The weekly cap must be a whole number from 1 to 50.";
  return null;
}

export function GeneralSettingsScreen() {
  const { projectId, project } = useProject();
  const { can } = useRbac();
  const { setTab } = useWorkspaceUrl();
  const canManage = can("campaign.settings.manage");
  const [loading, setLoading] = useState(true);

  const { form, set, dirty, saving, save, reset } = useSettingsForm(EMPTY, {
    onSave: async (values) => {
      const problem = validate(values);
      if (problem) return problem;
      const user = await getUser();
      const saved = await saveWorkspaceSettings(
        projectId,
        {
          general: { name: values.name.trim(), timezone: values.timezone, locale: values.locale, currency: values.currency },
          sending: {
            fromName: values.fromName.trim(),
            fromEmail: values.fromEmail.trim().toLowerCase(),
            replyTo: values.replyTo.trim().toLowerCase(),
            quietHours: values.quietEnabled ? { start: values.quietStart, end: values.quietEnd } : null,
            weeklyFrequencyCap: values.capEnabled ? Number(values.weeklyFrequencyCap) : null,
          },
        },
        { createdBy: user?.id ?? null },
      );
      return saved ? true : "Couldn't save settings — check your access and try again.";
    },
  });

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    getWorkspaceSettings(projectId).then((settings) => {
      if (!alive) return;
      if (settings) reset(toForm(settings, project?.name));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, project?.name, reset]);

  const disabled = !canManage;
  const timezones = TIMEZONE_OPTIONS.includes(form.timezone) ? TIMEZONE_OPTIONS : [form.timezone, ...TIMEZONE_OPTIONS];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="General"
        description="Workspace identity, localization and the sending defaults every campaign starts from."
        actions={<SaveChangesButton dirty={dirty} saving={saving} onClick={save} disabled={disabled} />}
      />

      {loading ? (
        <div className="flex min-h-60 items-center justify-center">
          <LogoLoading size={48} aria-label="Loading settings" />
        </div>
      ) : (
        <div className="space-y-6">
          {disabled ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
              <Lock className="h-4 w-4 shrink-0" /> You can view these settings; changing them needs the “Manage settings” permission.
            </div>
          ) : null}

          <SectionCard title="Workspace" description="How the workspace is named and how dates, times and money are shown.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Workspace name" htmlFor="ws-name" hint="Used as the sender's company name when a campaign has none.">
                <Input id="ws-name" value={form.name} onChange={(e) => set("name")(e.target.value)} disabled={disabled} />
              </Field>
              <Field label="Time zone" hint="Schedules, quiet hours and reports use this zone.">
                <Select value={form.timezone} onValueChange={set("timezone")} disabled={disabled}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Locale">
                <Select value={form.locale} onValueChange={set("locale")} disabled={disabled}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Currency" hint="Revenue and attribution reports are shown in this currency.">
                <Select value={form.currency} onValueChange={set("currency")} disabled={disabled}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </SectionCard>

          <SectionCard
            title="Sending defaults"
            description="Used whenever a campaign or automation doesn't set its own sender."
            action={
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setTab("Sending Domains")}>
                Sending domains
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="From name" htmlFor="ws-from-name">
                <Input id="ws-from-name" value={form.fromName} onChange={(e) => set("fromName")(e.target.value)} placeholder={form.name || "Your company"} disabled={disabled} />
              </Field>
              <Field label="From email" htmlFor="ws-from-email" hint="Must be on a verified sending domain.">
                <Input id="ws-from-email" type="email" value={form.fromEmail} onChange={(e) => set("fromEmail")(e.target.value)} placeholder="hello@yourdomain.com" disabled={disabled} />
              </Field>
              <Field label="Reply-to" htmlFor="ws-reply-to" hint="Leave empty to receive replies at the from address.">
                <Input id="ws-reply-to" type="email" value={form.replyTo} onChange={(e) => set("replyTo")(e.target.value)} placeholder="support@yourdomain.com" disabled={disabled} />
              </Field>
            </div>

            <SettingsList className="mt-5 border-t border-border pt-4">
              <SettingRow
                icon={Moon}
                title="Quiet hours"
                description="SMS, WhatsApp and automation messages due inside this window wait until it ends, in the recipient's time zone when known."
                control={<Switch checked={form.quietEnabled} onCheckedChange={set("quietEnabled")} disabled={disabled} aria-label="Quiet hours" />}
              />
              {form.quietEnabled ? (
                <div className="grid max-w-sm grid-cols-2 gap-3 py-3.5">
                  <Field label="From" htmlFor="ws-quiet-start">
                    <Input id="ws-quiet-start" type="time" value={form.quietStart} onChange={(e) => set("quietStart")(e.target.value)} disabled={disabled} />
                  </Field>
                  <Field label="Until" htmlFor="ws-quiet-end">
                    <Input id="ws-quiet-end" type="time" value={form.quietEnd} onChange={(e) => set("quietEnd")(e.target.value)} disabled={disabled} />
                  </Field>
                </div>
              ) : null}
              <SettingRow
                icon={Gauge}
                title="Weekly frequency cap"
                description="Contacts who already got this many marketing messages in the last 7 days are skipped by campaigns and automations."
                control={
                  <div className="flex items-center gap-3">
                    {form.capEnabled ? (
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={form.weeklyFrequencyCap}
                        onChange={(e) => set("weeklyFrequencyCap")(e.target.value)}
                        aria-label="Messages per week"
                        className="h-8 w-20 tabular-nums"
                        disabled={disabled}
                      />
                    ) : null}
                    <Switch checked={form.capEnabled} onCheckedChange={set("capEnabled")} disabled={disabled} aria-label="Weekly frequency cap" />
                  </div>
                }
              />
            </SettingsList>
          </SectionCard>
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default GeneralSettingsScreen;
