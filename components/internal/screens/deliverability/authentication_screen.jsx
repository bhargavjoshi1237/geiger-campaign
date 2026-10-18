"use client";

import React, { useMemo, useState } from "react";
import { ShieldCheck, RefreshCw, Copy } from "lucide-react";
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
  DataTable,
  Badge,
  ActionMenu,
  Field,
} from "@geiger/ui";

const DOMAINS = [
  { value: "mail.halcyon.studio", label: "mail.halcyon.studio" },
  { value: "news.brightlabs.io", label: "news.brightlabs.io" },
  { value: "send.northwind.co", label: "send.northwind.co" },
];

const RECORDS = {
  "mail.halcyon.studio": [
    { id: 1, type: "TXT", host: "mail.halcyon.studio", value: "v=spf1 include:spf.geiger.studio -all", status: "Verified" },
    { id: 2, type: "CNAME", host: "gk1._domainkey.mail.halcyon.studio", value: "gk1.dkim.geiger.studio", status: "Verified" },
    { id: 3, type: "TXT", host: "_dmarc.mail.halcyon.studio", value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@halcyon.studio; adkim=s; aspf=s", status: "Verified" },
    { id: 4, type: "CNAME", host: "bounce.mail.halcyon.studio", value: "rp.geiger.studio", status: "Verified" },
    { id: 5, type: "MX", host: "bounce.mail.halcyon.studio", value: "10 mx.geiger.studio", status: "Missing" },
  ],
  "news.brightlabs.io": [
    { id: 1, type: "TXT", host: "news.brightlabs.io", value: "v=spf1 include:spf.geiger.studio -all", status: "Verified" },
    { id: 2, type: "CNAME", host: "gk1._domainkey.news.brightlabs.io", value: "gk1.dkim.geiger.studio", status: "Verified" },
    { id: 3, type: "TXT", host: "_dmarc.news.brightlabs.io", value: "v=DMARC1; p=reject; rua=mailto:dmarc@brightlabs.io; adkim=s; aspf=s", status: "Verified" },
    { id: 4, type: "CNAME", host: "bounce.news.brightlabs.io", value: "rp.geiger.studio", status: "Verified" },
    { id: 5, type: "MX", host: "bounce.news.brightlabs.io", value: "10 mx.geiger.studio", status: "Verified" },
  ],
  "send.northwind.co": [
    { id: 1, type: "TXT", host: "send.northwind.co", value: "v=spf1 include:spf.geiger.studio -all", status: "Verified" },
    { id: 2, type: "CNAME", host: "gk1._domainkey.send.northwind.co", value: "gk1.dkim.geiger.studio", status: "Missing" },
    { id: 3, type: "TXT", host: "_dmarc.send.northwind.co", value: "v=DMARC1; p=none; rua=mailto:dmarc@northwind.co", status: "Verified" },
    { id: 4, type: "CNAME", host: "bounce.send.northwind.co", value: "rp.geiger.studio", status: "Missing" },
    { id: 5, type: "MX", host: "bounce.send.northwind.co", value: "10 mx.geiger.studio", status: "Missing" },
  ],
};

const TYPE_TONE = { TXT: "info", CNAME: "purple", MX: "neutral" };

const RECORD_COLUMNS = [
  { key: "type", header: "Type", render: (r) => <Badge variant={TYPE_TONE[r.type]}>{r.type}</Badge> },
  { key: "host", header: "Host", className: "max-w-[220px] truncate font-mono text-xs text-muted-foreground", render: (r) => r.host },
  { key: "value", header: "Value", className: "max-w-[260px] truncate font-mono text-xs text-muted-foreground", render: (r) => r.value },
  { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "Verified" ? "success" : "warning"}>{r.status}</Badge> },
  { key: "actions", header: "Actions", align: "right", render: () => <ActionMenu items={[{ label: "Copy value", icon: Copy }]} /> },
];

export function AuthenticationScreen() {
  const [domain, setDomain] = useState("mail.halcyon.studio");
  const [policy, setPolicy] = useState("quarantine");
  const [alignment, setAlignment] = useState(true);

  const records = useMemo(() => RECORDS[domain] ?? [], [domain]);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Authentication"
        description="Configure SPF, DKIM, and DMARC so mailbox providers trust your mail."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Config */}
        <SectionCard
          title={
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-text-secondary" /> Policy
            </span>
          }
          contentClassName="space-y-4"
        >
          <Field label="Domain">
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOMAINS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="DMARC policy" hint="How mailbox providers handle mail that fails authentication.">
            <Select value={policy} onValueChange={setPolicy}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (monitor only)</SelectItem>
                <SelectItem value="quarantine">Quarantine</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <SettingsList>
            <SettingRow
              title="Enforce alignment"
              description="Require strict SPF and DKIM alignment."
              checked={alignment}
              onCheckedChange={setAlignment}
            />
          </SettingsList>
        </SectionCard>

        {/* DNS records */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">DNS records</h2>
            <Button variant="outline" className="bg-surface-card hover:bg-surface-subtle">
              <RefreshCw className="h-4 w-4" /> Re-check DNS
            </Button>
          </div>
          <DataTable columns={RECORD_COLUMNS} data={records} getRowKey={(r) => r.id} />
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default AuthenticationScreen;
