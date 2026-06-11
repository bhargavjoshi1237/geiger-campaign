"use client";

import React, { useMemo, useState } from "react";
import { ShieldCheck, RefreshCw, Copy } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const DOMAINS = [
  { value: "mail.acmestore.com", label: "mail.acmestore.com" },
  { value: "news.brightlabs.io", label: "news.brightlabs.io" },
  { value: "send.northwind.co", label: "send.northwind.co" },
];

const RECORDS = {
  "mail.acmestore.com": [
    { id: 1, type: "TXT", host: "mail.acmestore.com", value: "v=spf1 include:spf.geiger.studio -all", status: "Verified" },
    { id: 2, type: "CNAME", host: "gk1._domainkey.mail.acmestore.com", value: "gk1.dkim.geiger.studio", status: "Verified" },
    { id: 3, type: "TXT", host: "_dmarc.mail.acmestore.com", value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@acmestore.com; adkim=s; aspf=s", status: "Verified" },
    { id: 4, type: "CNAME", host: "bounce.mail.acmestore.com", value: "rp.geiger.studio", status: "Verified" },
    { id: 5, type: "MX", host: "bounce.mail.acmestore.com", value: "10 mx.geiger.studio", status: "Missing" },
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

const TYPE_TONE = { TXT: "blue", CNAME: "violet", MX: "zinc" };

export function AuthenticationScreen() {
  const [domain, setDomain] = useState("mail.acmestore.com");
  const [policy, setPolicy] = useState("quarantine");
  const [alignment, setAlignment] = useState(true);

  const records = useMemo(() => RECORDS[domain] ?? [], [domain]);

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Authentication"
        description="Configure SPF, DKIM, and DMARC so mailbox providers trust your mail."
      />

      <div className="grid grid-cols-1 gap-4 border-t border-surface-active pt-4 lg:grid-cols-[360px_1fr]">
        {/* Config */}
        <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-foreground">Policy</h2>
          </div>
          <Field label="Domain">
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOMAINS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="DMARC policy" hint="How mailbox providers handle mail that fails authentication.">
            <Select value={policy} onValueChange={setPolicy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (monitor only)</SelectItem>
                <SelectItem value="quarantine">Quarantine</SelectItem>
                <SelectItem value="reject">Reject</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Enforce alignment</p>
              <p className="text-xs text-text-secondary">Require strict SPF and DKIM alignment.</p>
            </div>
            <Switch checked={alignment} onCheckedChange={setAlignment} />
          </div>
        </div>

        {/* DNS records */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">DNS records</h2>
            <Button variant="outline" className="h-9 border-border bg-surface-card text-foreground hover:bg-surface-subtle">
              <RefreshCw className="h-4 w-4" /> Re-check DNS
            </Button>
          </div>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
                  <TableHead>Type</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id} className="border-border">
                    <TableCell><Pill tone={TYPE_TONE[r.type]}>{r.type}</Pill></TableCell>
                    <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">{r.host}</TableCell>
                    <TableCell className="max-w-[260px] truncate font-mono text-xs text-muted-foreground">{r.value}</TableCell>
                    <TableCell><Pill tone={r.status === "Verified" ? "green" : "amber"}>{r.status}</Pill></TableCell>
                    <TableCell className="text-right">
                      <RowActions items={[{ label: "Copy value", icon: Copy }]} />
                    </TableCell>
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

export default AuthenticationScreen;
