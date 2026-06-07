"use client";

import React, { useMemo, useState } from "react";
import { Plus, Globe, FileText, RefreshCw, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, SearchInput, Pill, RowActions, Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const REGION_LABEL = { us: "US (us-east)", eu: "EU (eu-west)", au: "AU (ap-southeast)" };

const INITIAL = [
  { id: 1, domain: "mail.acmestore.com", region: "us", spf: "pass", dkim: "pass", dmarc: "pass", status: "Verified" },
  { id: 2, domain: "news.brightlabs.io", region: "eu", spf: "pass", dkim: "pass", dmarc: "pass", status: "Verified" },
  { id: 3, domain: "send.northwind.co", region: "us", spf: "pass", dkim: "fail", dmarc: "pass", status: "Pending" },
  { id: 4, domain: "updates.lumen.app", region: "au", spf: "pass", dkim: "pass", dmarc: "fail", status: "Pending" },
  { id: 5, domain: "promo.heritagebank.com", region: "us", spf: "fail", dkim: "fail", dmarc: "fail", status: "Failed" },
];

const STATUS_TONE = { Verified: "green", Pending: "amber", Failed: "red" };

function AddDomainDialog({ open, onOpenChange, onCreate }) {
  const [domain, setDomain] = useState("");
  const [region, setRegion] = useState("us");

  const submit = () => {
    if (!domain.trim()) return;
    onCreate({
      domain: domain.trim().toLowerCase(),
      region,
      spf: "fail",
      dkim: "fail",
      dmarc: "fail",
      status: "Pending",
    });
    setDomain("");
    setRegion("us");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add sending domain</DialogTitle>
          <DialogDescription>Add a domain, then publish the generated DNS records to verify it.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Domain" htmlFor="d-domain" hint="Use a subdomain dedicated to email, e.g. mail.yourbrand.com.">
            <Input id="d-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mail.yourbrand.com" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Sending region">
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="us">United States</SelectItem>
                <SelectItem value="eu">European Union</SelectItem>
                <SelectItem value="au">Australia</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} disabled={!domain.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Add domain</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SendingDomainsScreen() {
  const [domains, setDomains] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return domains.filter((d) => !q || d.domain.toLowerCase().includes(q));
  }, [domains, query]);

  const reverify = (id) => setDomains((p) => p.map((d) => (d.id === id ? { ...d, status: "Pending" } : d)));
  const remove = (id) => setDomains((p) => p.filter((d) => d.id !== id));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Sending Domains"
        description="Verify the domains you send from and keep their DNS records healthy."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Add domain
          </Button>
        }
      />

      <div className="border-t border-[#242424] pt-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Search domains…" />
      </div>

      <TableShell>
        <Table>
          <TableHeader>
            <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead>Domain</TableHead>
              <TableHead>SPF</TableHead>
              <TableHead>DKIM</TableHead>
              <TableHead>DMARC</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((d) => (
              <TableRow key={d.id} className="border-[#2a2a2a]">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                      <Globe className="h-4 w-4" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-[#ededed]">{d.domain}</span>
                      <span className="truncate text-xs text-[#737373]">{REGION_LABEL[d.region]}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Pill tone={d.spf === "pass" ? "green" : "red"}>{d.spf === "pass" ? "Pass" : "Fail"}</Pill></TableCell>
                <TableCell><Pill tone={d.dkim === "pass" ? "green" : "red"}>{d.dkim === "pass" ? "Pass" : "Fail"}</Pill></TableCell>
                <TableCell><Pill tone={d.dmarc === "pass" ? "green" : "red"}>{d.dmarc === "pass" ? "Pass" : "Fail"}</Pill></TableCell>
                <TableCell><Pill tone={STATUS_TONE[d.status]}>{d.status}</Pill></TableCell>
                <TableCell className="text-right">
                  <RowActions
                    items={[
                      { label: "View DNS records", icon: FileText },
                      { label: "Re-verify", icon: RefreshCw, onSelect: () => reverify(d.id) },
                      { label: "Remove", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => remove(d.id) },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No domains found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      <AddDomainDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(d) => setDomains((p) => [{ id: Date.now(), ...d }, ...p])} />
    </MainScreenWrapper>
  );
}

export default SendingDomainsScreen;
