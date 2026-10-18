"use client";

import React, { useMemo, useState } from "react";
import { Flame } from "lucide-react";
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
  DataTable,
  Badge,
  Field,
} from "@geiger/ui";

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

const STATUS_TONE = { Complete: "success", "In progress": "warning", Scheduled: "neutral" };

const SCHEDULE_COLUMNS = [
  { key: "day", header: "Day", className: "font-medium text-foreground", render: (s) => `Day ${s.day}` },
  { key: "date", header: "Date", className: "whitespace-nowrap text-muted-foreground", render: (s) => s.date },
  { key: "cap", header: "Daily cap", className: "tabular-nums text-muted-foreground", render: (s) => s.cap.toLocaleString() },
  { key: "sent", header: "Sent", className: "tabular-nums text-muted-foreground", render: (s) => s.sent.toLocaleString() },
  { key: "status", header: "Status", render: (s) => <Badge variant={STATUS_TONE[s.status]}>{s.status}</Badge> },
];

export function IpWarmupScreen() {
  const [ip, setIp] = useState(IPS[1]);
  const [enabled, setEnabled] = useState(true);
  const [target, setTarget] = useState("250000");
  const [duration, setDuration] = useState("30");

  const schedule = useMemo(() => SCHEDULE, []);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="IP Warmup"
        description="Gradually ramp sending volume to build a strong IP reputation."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Config */}
        <SectionCard
          title={
            <span className="inline-flex items-center gap-2">
              <Flame className="h-4 w-4 text-text-secondary" /> Warmup settings
            </span>
          }
          contentClassName="space-y-4"
        >
          <Field label="IP address">
            <Select value={ip} onValueChange={setIp}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {IPS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <SettingsList>
            <SettingRow
              title="Enable automatic warmup"
              description="Caps grow each day until the target is reached."
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </SettingsList>
          <Field label="Target daily volume" htmlFor="w-target" hint="Maximum messages per day after warmup completes.">
            <Input id="w-target" type="number" value={target} onChange={(e) => setTarget(e.target.value)} className="border-border" />
          </Field>
          <Field label="Ramp duration">
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="45">45 days</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </SectionCard>

        {/* Schedule */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Warmup schedule</h2>
          <DataTable columns={SCHEDULE_COLUMNS} data={schedule} getRowKey={(s) => s.id} />
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default IpWarmupScreen;
