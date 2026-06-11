"use client";

import React, { useState } from "react";
import { Plus, Smartphone, Globe, Settings2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PLATFORM_ICON = { iOS: Smartphone, Android: Smartphone, Web: Globe };
const STATUS_TONE = { Connected: "green", "Not configured": "zinc" };
const PLATFORMS = ["iOS", "Android", "Web"];
const CREDENTIAL_BY_PLATFORM = { iOS: "APNs key", Android: "FCM key", Web: "VAPID key" };

const INITIAL = [
  { id: 1, platform: "iOS", identifier: "com.geiger.app", credential: "APNs key", status: "Connected" },
  { id: 2, platform: "Android", identifier: "com.geiger.app", credential: "FCM key", status: "Connected" },
  { id: 3, platform: "Web", identifier: "studio.geiger.web", credential: "VAPID key", status: "Not configured" },
];

function ToggleRow({ title, description, checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
      <div className="space-y-0.5 pr-3">
        <p className="text-sm font-medium text-[#e5e5e5]">{title}</p>
        <p className="text-xs text-text-secondary">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

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
        <DialogBody className="space-y-4 py-4">
          <Field label="Platform">
            <Select value={form.platform} onValueChange={set("platform")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="App identifier" htmlFor="push-id">
            <Input id="push-id" value={form.identifier} onChange={(e) => set("identifier")(e.target.value)} placeholder="com.yourcompany.app" className="bg-background border-border" />
          </Field>
          <Field label="Credential reference" htmlFor="push-cred" hint="Name of the stored key/certificate.">
            <Input id="push-cred" value={form.credential} onChange={(e) => set("credential")(e.target.value)} placeholder="e.g. APNs key" className="bg-background border-border" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} className="bg-white text-black hover:bg-[#e5e5e5]">Add platform</Button>
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

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Push"
        description="Connect your apps and control how push notifications are delivered."
        actions={
          <Button onClick={() => setAddOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Add platform
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 border-t border-surface-active pt-4 lg:grid-cols-[360px_1fr]">
        {/* Delivery settings */}
        <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-5">
          <h3 className="text-sm font-semibold text-foreground">Delivery settings</h3>
          <ToggleRow title="Show badge counts" description="Display unread counts on the app icon." checked={badgeCounts} onCheckedChange={setBadgeCounts} />
          <ToggleRow title="Respect quiet hours" description="Hold notifications during a user's quiet window." checked={quietHours} onCheckedChange={setQuietHours} />
          <ToggleRow title="Collapse similar notifications" description="Stack duplicate alerts into one." checked={collapse} onCheckedChange={setCollapse} />
          <Field label="Default sound">
            <Select value={sound} onValueChange={setSound}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Default">Default</SelectItem>
                <SelectItem value="Chime">Chime</SelectItem>
                <SelectItem value="None">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Connected platforms */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Connected platforms</h3>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
                  <TableHead>Platform</TableHead>
                  <TableHead>App identifier</TableHead>
                  <TableHead>Credential</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {platforms.map((p) => {
                  const Icon = PLATFORM_ICON[p.platform] || Smartphone;
                  return (
                    <TableRow key={p.id} className="border-border">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-active text-muted-foreground">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="font-medium text-foreground">{p.platform}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{p.identifier}</TableCell>
                      <TableCell className="text-muted-foreground">{p.credential}</TableCell>
                      <TableCell><Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill></TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          items={[
                            { label: "Reconfigure", icon: Settings2 },
                            { label: "Remove", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setPlatforms((prev) => prev.filter((x) => x.id !== p.id)) },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {platforms.length === 0 && (
                  <TableRow className="border-border hover:bg-transparent">
                    <TableCell colSpan={5} className="py-14 text-center text-sm text-text-secondary">No platforms found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableShell>
        </div>
      </div>

      <AddPlatformDialog open={addOpen} onOpenChange={setAddOpen} onCreate={(p) => setPlatforms((prev) => [{ id: Date.now(), ...p }, ...prev])} />
    </MainScreenWrapper>
  );
}

export default PushScreen;
