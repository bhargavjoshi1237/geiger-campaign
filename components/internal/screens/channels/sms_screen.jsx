"use client";

import React, { useState } from "react";
import { Plus, Smartphone, Trash2 } from "lucide-react";
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

const TYPE_TONE = {
  "Long code": "zinc",
  "Toll-free": "blue",
  "Short code": "violet",
};

const COUNTRIES = ["United States", "United Kingdom", "Canada", "Australia"];
const NUMBER_TYPES = ["Long code", "Toll-free", "Short code"];

const INITIAL_NUMBERS = [
  { id: 1, number: "+1 (415) 555-0142", country: "United States", type: "Long code", capabilities: ["SMS", "MMS"], status: "Active" },
  { id: 2, number: "+1 (888) 555-0177", country: "United States", type: "Toll-free", capabilities: ["SMS"], status: "Active" },
  { id: 3, number: "+44 7400 555231", country: "United Kingdom", type: "Long code", capabilities: ["SMS"], status: "Active" },
  { id: 4, number: "55512", country: "United States", type: "Short code", capabilities: ["SMS", "MMS"], status: "Active" },
  { id: 5, number: "+1 (604) 555-0119", country: "Canada", type: "Long code", capabilities: ["SMS"], status: "Pending" },
];

function AddNumberDialog({ open, onOpenChange, onCreate }) {
  const [form, setForm] = useState({ country: COUNTRIES[0], type: NUMBER_TYPES[0], areaCode: "" });

  const submit = () => {
    onCreate({
      number: form.areaCode.trim() ? `+1 (${form.areaCode.trim()}) 555-01XX` : "Provisioning…",
      country: form.country,
      type: form.type,
      capabilities: form.type === "Toll-free" ? ["SMS"] : ["SMS", "MMS"],
      status: "Pending",
    });
    setForm({ country: COUNTRIES[0], type: NUMBER_TYPES[0], areaCode: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add sending number</DialogTitle>
          <DialogDescription>Provision a new number for SMS campaigns. It activates once carrier registration completes.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Field label="Country">
            <Select value={form.country} onValueChange={(v) => setForm((f) => ({ ...f, country: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Number type">
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{NUMBER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Preferred area code" htmlFor="n-area" hint="We'll provision an available number.">
            <Input id="n-area" value={form.areaCode} onChange={(e) => setForm((f) => ({ ...f, areaCode: e.target.value }))} placeholder="e.g. 415" className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-[#a3a3a3] hover:bg-[#242424] hover:text-white">Cancel</Button>
          <Button onClick={submit} className="bg-white text-black hover:bg-[#e5e5e5]">Add number</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SmsScreen() {
  const [numbers, setNumbers] = useState(INITIAL_NUMBERS);
  const [createOpen, setCreateOpen] = useState(false);

  const [defaultNumber, setDefaultNumber] = useState(INITIAL_NUMBERS[0].number);
  const [optOutKeyword, setOptOutKeyword] = useState("STOP");
  const [helpKeyword, setHelpKeyword] = useState("HELP");
  const [appendOptOut, setAppendOptOut] = useState(true);

  const release = (id) => setNumbers((p) => p.filter((n) => n.id !== id));

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="SMS"
        description="Manage sending numbers, sender IDs, and opt-out compliance."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <Plus className="h-4 w-4" /> Add number
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 border-t border-[#242424] pt-4 lg:grid-cols-[360px_1fr]">
        {/* Config */}
        <div className="space-y-4 rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-5">
          <h2 className="text-sm font-semibold text-[#ededed]">SMS settings</h2>

          <Field label="Default sender number">
            <Select value={defaultNumber} onValueChange={setDefaultNumber}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {numbers.map((n) => <SelectItem key={n.id} value={n.number}>{n.number}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Opt-out keyword" htmlFor="s-optout">
            <Input id="s-optout" value={optOutKeyword} onChange={(e) => setOptOutKeyword(e.target.value)} className="bg-[#161616] border-[#2a2a2a]" />
          </Field>
          <Field label="Help keyword" htmlFor="s-help">
            <Input id="s-help" value={helpKeyword} onChange={(e) => setHelpKeyword(e.target.value)} className="bg-[#161616] border-[#2a2a2a]" />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#202020] px-4 py-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[#e5e5e5]">Append opt-out notice to first message</p>
              <p className="text-xs text-[#737373]">Adds "Reply {optOutKeyword} to unsubscribe" to a contact's first SMS.</p>
            </div>
            <Switch checked={appendOptOut} onCheckedChange={setAppendOptOut} />
          </div>
        </div>

        {/* Sending numbers */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[#ededed]">Sending numbers</h2>
            <p className="text-xs text-[#737373]">Numbers and short codes registered to your account.</p>
          </div>

          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-[#2a2a2a] bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                  <TableHead>Number</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((n) => (
                  <TableRow key={n.id} className="border-[#2a2a2a]">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#242424] text-[#a3a3a3]">
                          <Smartphone className="h-4 w-4" />
                        </span>
                        <span className="font-mono text-[#ededed]">{n.number}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#a3a3a3]">{n.country}</TableCell>
                    <TableCell><Pill tone={TYPE_TONE[n.type]}>{n.type}</Pill></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {n.capabilities.map((c) => (
                          <span key={c} className="rounded-md border border-[#2a2a2a] bg-[#242424] px-1.5 py-0.5 text-xs text-[#a3a3a3]">{c}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Pill tone={n.status === "Active" ? "green" : "amber"}>{n.status}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        items={[
                          { label: "Release number", icon: Trash2, danger: true, onSelect: () => release(n.id) },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {numbers.length === 0 && (
                  <TableRow className="border-[#2a2a2a] hover:bg-transparent">
                    <TableCell colSpan={6} className="py-14 text-center text-sm text-[#737373]">No sending numbers found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableShell>
        </div>
      </div>

      <AddNumberDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(n) => setNumbers((p) => [{ id: Date.now(), ...n }, ...p])} />
    </MainScreenWrapper>
  );
}

export default SmsScreen;
