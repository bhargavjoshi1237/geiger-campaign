"use client";

import React, { useState } from "react";
import { Plus, Smartphone, Globe, Settings2, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScreenHeader,
  SectionCard,
  SettingRow,
  SettingsList,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const PLATFORM_ICON = { iOS: Smartphone, Android: Smartphone, Web: Globe };
const STATUS_TONE = { Connected: "success", "Not configured": "neutral" };
const PLATFORMS = ["iOS", "Android", "Web"];
const CREDENTIAL_BY_PLATFORM = { iOS: "APNs key", Android: "FCM key", Web: "VAPID key" };

const INITIAL = [
  { id: 1, platform: "iOS", identifier: "com.geiger.app", credential: "APNs key", status: "Connected" },
  { id: 2, platform: "Android", identifier: "com.geiger.app", credential: "FCM key", status: "Connected" },
  { id: 3, platform: "Web", identifier: "studio.geiger.web", credential: "VAPID key", status: "Not configured" },
];

function AddPlatformDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ platform: "iOS", identifier: "", credential: "" });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    onCreate({
      platform: form.platform,
      identifier: form.identifier.trim() || "—",
      credential: form.credential.trim() || CREDENTIAL_BY_PLATFORM[form.platform],
      status: "Connected",
    });
    setForm({ platform: "iOS", identifier: "", credential: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add platform</DialogTitle>
          <DialogDescription>Connect an app so it can receive push notifications.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Field label="Platform">
            <Select value={form.platform} onValueChange={set("platform")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="App identifier" htmlFor="push-id">
            <Input id="push-id" value={form.identifier} onChange={(e) => set("identifier")(e.target.value)} placeholder="com.yourcompany.app" className="border-border" />
          </Field>
          <Field label="Credential reference" htmlFor="push-cred" hint="Name of the stored key/certificate.">
            <Input id="push-cred" value={form.credential} onChange={(e) => set("credential")(e.target.value)} placeholder="e.g. APNs key" className="border-border" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Add platform</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PushScreen() {
  const [platforms, setPlatforms] = useState(INITIAL);
  const [addOpen, setAddOpen] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState(true);
  const [quietHours, setQuietHours] = useState(true);
  const [collapse, setCollapse] = useState(false);
  const [sound, setSound] = useState("Default");

  const columns = [
    {
      key: "platform",
      header: "Platform",
      render: (p) => {
        const Icon = PLATFORM_ICON[p.platform] || Smartphone;
        return (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="font-medium text-foreground">{p.platform}</span>
          </div>
        );
      },
    },
    { key: "identifier", header: "App identifier", className: "font-mono text-sm text-muted-foreground", render: (p) => p.identifier },
    { key: "credential", header: "Credential", className: "text-muted-foreground", render: (p) => p.credential },
    { key: "status", header: "Status", render: (p) => <Badge variant={STATUS_TONE[p.status]}>{p.status}</Badge> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (p) => (
        <ActionMenu
          items={[
            { label: "Reconfigure", icon: Settings2 },
            { separator: true },
            { label: "Remove", icon: Trash2, destructive: true, onSelect: () => setPlatforms((prev) => prev.filter((x) => x.id !== p.id)) },
          ]}
        />
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Push"
        description="Connect your apps and control how push notifications are delivered."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add platform
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Delivery settings */}
        <SectionCard title="Delivery settings" contentClassName="space-y-4">
          <SettingsList>
            <SettingRow title="Show badge counts" description="Display unread counts on the app icon." checked={badgeCounts} onCheckedChange={setBadgeCounts} />
            <SettingRow title="Respect quiet hours" description="Hold notifications during a user's quiet window." checked={quietHours} onCheckedChange={setQuietHours} />
            <SettingRow title="Collapse similar notifications" description="Stack duplicate alerts into one." checked={collapse} onCheckedChange={setCollapse} />
          </SettingsList>
          <Field label="Default sound">
            <Select value={sound} onValueChange={setSound}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Default">Default</SelectItem>
                <SelectItem value="Chime">Chime</SelectItem>
                <SelectItem value="None">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </SectionCard>

        {/* Connected platforms */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Connected platforms</h3>
          <DataTable
            columns={columns}
            data={platforms}
            getRowKey={(p) => p.id}
            empty={
              <EmptyState
                icon={Smartphone}
                title="No platforms found"
                className="rounded-xl border border-border bg-surface-subtle"
                action={
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className="h-4 w-4" /> Add platform
                  </Button>
                }
              />
            }
          />
        </div>
      </div>

      <AddPlatformDialog open={addOpen} onOpenChange={setAddOpen} onCreate={(p) => setPlatforms((prev) => [{ id: Date.now(), ...p }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default PushScreen;
