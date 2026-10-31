"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Download, Eye, Link2, Loader2, Lock, MailCheck, MousePointerClick, Tags } from "lucide-react";
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
import { apiGet } from "@/lib/api/client";
import { RETENTION_OPTIONS, isValidDomain } from "@/lib/settings/defaults";
import { getWorkspaceSettings, saveWorkspaceSettings } from "@/lib/supabase/workspace_settings";
import { getUser } from "@/lib/supabase/user";
import { SaveChangesButton, useSettingsForm } from "./settings_form";

const EMPTY = {
  opens: true,
  clicks: true,
  linkDomain: "",
  utmEnabled: false,
  utmSource: "",
  utmMedium: "",
  doubleOptInDefault: false,
  retention: "forever",
};

const UTM_VALUE = /^[a-z0-9_.-]{0,60}$/i;

function toForm({ tracking, advanced }) {
  return {
    opens: tracking.opens,
    clicks: tracking.clicks,
    linkDomain: tracking.linkDomain,
    utmEnabled: Boolean(tracking.utm),
    utmSource: tracking.utm?.source || "",
    utmMedium: tracking.utm?.medium || "",
    doubleOptInDefault: advanced.doubleOptInDefault,
    retention: advanced.retentionMonths ? String(advanced.retentionMonths) : "forever",
  };
}

function validate(form) {
  if (form.linkDomain && !isValidDomain(form.linkDomain)) return "The link domain should be a host name like links.yourdomain.com.";
  if (form.utmEnabled && (!UTM_VALUE.test(form.utmSource) || !UTM_VALUE.test(form.utmMedium))) {
    return "UTM values can only use letters, numbers, dots, dashes and underscores.";
  }
  return null;
}

function downloadJson(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AdvancedSettingsScreen() {
  const { projectId } = useProject();
  const { can } = useRbac();
  const canManage = can("campaign.settings.manage");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const { form, set, dirty, saving, save, reset } = useSettingsForm(EMPTY, {
    onSave: async (values) => {
      const problem = validate(values);
      if (problem) return problem;
      const user = await getUser();
      const saved = await saveWorkspaceSettings(
        projectId,
        {
          tracking: {
            opens: values.opens,
            clicks: values.clicks,
            linkDomain: values.linkDomain.trim().toLowerCase(),
            utm: values.utmEnabled ? { enabled: true, source: values.utmSource.trim(), medium: values.utmMedium.trim() } : null,
          },
          advanced: {
            doubleOptInDefault: values.doubleOptInDefault,
            retentionMonths: values.retention === "forever" ? null : Number(values.retention),
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
      if (settings) reset(toForm(settings));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, reset]);

  const exportData = async () => {
    setExporting(true);
    const res = await apiGet(`/api/projects/${projectId}/settings/export`);
    setExporting(false);
    if (!res.ok || !res.data) {
      toast.error(res.error || "Couldn't export the workspace.");
      return;
    }
    downloadJson(res.data, `campaign-export-${String(res.data.exportedAt || new Date().toISOString()).slice(0, 10)}.json`);
    const rows = (res.data.manifest || []).reduce((sum, t) => sum + (t.rows || 0), 0);
    const truncated = (res.data.manifest || []).filter((t) => t.truncated).map((t) => t.table);
    toast.success(`Exported ${rows.toLocaleString()} rows.${truncated.length ? ` Capped at ${res.data.rowLimitPerTable?.toLocaleString()} rows: ${truncated.join(", ")}.` : ""}`);
  };

  const disabled = !canManage;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Advanced"
        description="Tracking, audience defaults, data retention and workspace export."
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

          <SectionCard title="Tracking" description="How sends measure engagement. Applies to every email sent from now on.">
            <SettingsList>
              <SettingRow
                icon={Eye}
                title="Open tracking"
                description="Adds a 1×1 pixel to emails. Apple Mail Privacy Protection inflates opens, so read them as directional."
                control={<Switch checked={form.opens} onCheckedChange={set("opens")} disabled={disabled} aria-label="Open tracking" />}
              />
              <SettingRow
                icon={MousePointerClick}
                title="Click tracking"
                description="Rewrites links through a redirect to count clicks and attribute conversions."
                control={<Switch checked={form.clicks} onCheckedChange={set("clicks")} disabled={disabled} aria-label="Click tracking" />}
              />
              <SettingRow
                icon={Tags}
                title="UTM parameters"
                description="Appends utm_source, utm_medium and utm_campaign to every tracked link that doesn't already carry them."
                control={<Switch checked={form.utmEnabled} onCheckedChange={set("utmEnabled")} disabled={disabled} aria-label="UTM parameters" />}
              />
              {form.utmEnabled ? (
                <div className="grid max-w-lg gap-3 py-3.5 sm:grid-cols-2">
                  <Field label="utm_source" htmlFor="adv-utm-source" hint="Empty uses “geiger”.">
                    <Input id="adv-utm-source" value={form.utmSource} onChange={(e) => set("utmSource")(e.target.value)} placeholder="geiger" disabled={disabled} />
                  </Field>
                  <Field label="utm_medium" htmlFor="adv-utm-medium" hint="Empty uses the channel, e.g. “email”.">
                    <Input id="adv-utm-medium" value={form.utmMedium} onChange={(e) => set("utmMedium")(e.target.value)} placeholder="email" disabled={disabled} />
                  </Field>
                </div>
              ) : null}
              <SettingRow
                icon={Link2}
                title="Link domain"
                description="Host for tracked links instead of the app's own domain. Point a CNAME at this app before setting it."
                control={
                  <Input
                    value={form.linkDomain}
                    onChange={(e) => set("linkDomain")(e.target.value)}
                    placeholder="links.yourdomain.com"
                    aria-label="Link domain"
                    className="h-8 w-56 font-mono text-xs"
                    disabled={disabled}
                  />
                }
              />
            </SettingsList>
          </SectionCard>

          <SectionCard title="Audience defaults">
            <SettingsList>
              <SettingRow
                icon={MailCheck}
                title="Double opt-in for new lists"
                description="New lists start with confirmation emails on, so contacts must confirm before they're subscribed."
                control={<Switch checked={form.doubleOptInDefault} onCheckedChange={set("doubleOptInDefault")} disabled={disabled} aria-label="Double opt-in for new lists" />}
              />
            </SettingsList>
          </SectionCard>

          <SectionCard title="Data" description="How long activity is kept, and a full copy of the workspace on demand.">
            <SettingsList>
              <SettingRow
                icon={Clock}
                title="Activity retention"
                description="Sends and tracked events older than this are retired from reports, segments and exports by the background worker."
                control={
                  <Select value={form.retention} onValueChange={set("retention")} disabled={disabled}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RETENTION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <SettingRow
                icon={Download}
                title="Export workspace data"
                description="Downloads contacts, lists, segments, campaigns, sends, events, connections (no credentials) and settings as one JSON file."
                control={
                  <Button
                    variant="outline"
                    className="border-border bg-surface-card text-foreground hover:bg-surface-subtle"
                    disabled={disabled || exporting}
                    onClick={exportData}
                  >
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    {exporting ? "Exporting…" : "Export JSON"}
                  </Button>
                }
              />
            </SettingsList>
          </SectionCard>
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default AdvancedSettingsScreen;
