"use client";

import React, { useMemo, useState } from "react";
import { Flame } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, Field } from "@/components/internal/shared/screen_kit";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const IPS = ["198.51.100.24", "203.0.113.88", "192.0.2.140"];

const SCHEDULE = [
  { id: 1, day: 1, date: "May 27, 2026", cap: 500, sent: 500, status: "Complete" },
  { id: 2, day: 2, date: "May 28, 2026", cap: 1000, sent: 1000, status: "Complete" },
  { id: 3, day: 3, date: "May 29, 2026", cap: 2000, sent: 2000, status: "Complete" },
  { id: 4, day: 4, date: "May 30, 2026", cap: 4000, sent: 4000, status: "Complete" },
  { id: 5, day: 5, date: "May 31, 2026", cap: 8000, sent: 8000, status: "Complete" },
  { id: 6, day: 6, date: "Jun 1, 2026", cap: 16000, sent: 9240, status: "In progress" },
  { id: 7, day: 7, date: "Jun 2, 2026", cap: 32000, sent: 0, status: "Scheduled" },
  { id: 8, day: 8, date: "Jun 3, 2026", cap: 64000, sent: 0, status: "Scheduled" },
];

const STATUS_TONE = { Complete: "green", "In progress": "amber", Scheduled: "zinc" };

export function IpWarmupScreen() {
  const [ip, setIp] = useState(IPS[1]);
  const [enabled, setEnabled] = useState(true);
  const [target, setTarget] = useState("250000");
  const [duration, setDuration] = useState("30");

  const schedule = useMemo(() => SCHEDULE, []);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="IP Warmup"
        description="Gradually ramp sending volume to build a strong IP reputation."
      />

      <div className="grid grid-cols-1 gap-4 border-t border-surface-active pt-4 lg:grid-cols-[360px_1fr]">
        {/* Config */}
        <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-5">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-foreground">Warmup settings</h2>
          </div>
          <Field label="IP address">
            <Select value={ip} onValueChange={setIp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {IPS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Enable automatic warmup</p>
              <p className="text-xs text-text-secondary">Caps grow each day until the target is reached.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <Field label="Target daily volume" htmlFor="w-target" hint="Maximum messages per day after warmup completes.">
            <Input id="w-target" type="number" value={target} onChange={(e) => setTarget(e.target.value)} className="bg-background border-border" />
          </Field>
          <Field label="Ramp duration">
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="45">45 days</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Schedule */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Warmup schedule</h2>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
                  <TableHead>Day</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Daily cap</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map((s) => (
                  <TableRow key={s.id} className="border-border">
                    <TableCell className="font-medium text-foreground">Day {s.day}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{s.date}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{s.cap.toLocaleString()}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{s.sent.toLocaleString()}</TableCell>
                    <TableCell><Pill tone={STATUS_TONE[s.status]}>{s.status}</Pill></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default IpWarmupScreen;
