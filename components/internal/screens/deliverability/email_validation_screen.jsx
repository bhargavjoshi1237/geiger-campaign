"use client";

import React, { useMemo, useState } from "react";
import { ListChecks, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { TableShell, Pill, RowActions } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const RESULT_TONE = { Valid: "green", Risky: "amber", Invalid: "red", Unknown: "zinc" };

const INITIAL = [
  { id: 1, email: "jordan.lee@acmestore.com", result: "Valid", reason: "Mailbox exists" },
  { id: 2, email: "sales@brightlabs.io", result: "Risky", reason: "Catch-all domain" },
  { id: 3, email: "noreply@northwind", result: "Invalid", reason: "No MX record" },
  { id: 4, email: "a.patel@lumen.app", result: "Valid", reason: "Mailbox exists" },
  { id: 5, email: "info@heritagebank.com", result: "Risky", reason: "Role-based address" },
  { id: 6, email: "olduser@gmail.com", result: "Invalid", reason: "Mailbox full" },
  { id: 7, email: "t.nguyen@vault.dev", result: "Valid", reason: "Mailbox exists" },
  { id: 8, email: "support@", result: "Invalid", reason: "Malformed address" },
];

function ValidateDialog({ open, onOpenChange, onValidate }) {
  const [text, setText] = useState("");

  const submit = () => {
    const emails = text
      .split(/[\n,]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) return;
    onValidate(emails);
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Validate list</DialogTitle>
          <DialogDescription>Paste addresses, one per line. They are queued for verification.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4 py-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"jordan@example.com\nsales@example.com"}
            className="min-h-[160px] bg-background border-border font-mono text-sm"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">Cancel</Button>
          <Button onClick={submit} disabled={!text.trim()} className="bg-white text-black hover:bg-[#e5e5e5]">Validate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmailValidationScreen() {
  const [results, setResults] = useState(INITIAL);
  const [validateOpen, setValidateOpen] = useState(false);

  const counts = useMemo(() => {
    return results.reduce(
      (acc, r) => {
        acc.total += 1;
        if (r.result === "Valid") acc.valid += 1;
        else if (r.result === "Risky") acc.risky += 1;
        else if (r.result === "Invalid") acc.invalid += 1;
        else acc.unknown += 1;
        return acc;
      },
      { total: 0, valid: 0, risky: 0, invalid: 0, unknown: 0 },
    );
  }, [results]);

  const remove = (id) => setResults((p) => p.filter((r) => r.id !== id));

  const addEmails = (emails) => {
    const base = Date.now();
    const added = emails.map((email, i) => ({ id: base + i, email, result: "Unknown", reason: "Queued for verification" }));
    setResults((p) => [...added, ...p]);
  };

  const summaryRows = [
    { label: "Valid", value: counts.valid, tone: "green" },
    { label: "Risky", value: counts.risky, tone: "amber" },
    { label: "Invalid", value: counts.invalid, tone: "red" },
    { label: "Unknown", value: counts.unknown, tone: "zinc" },
  ];

  return (
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="Email Validation"
        description="Verify addresses before you send to protect your sender reputation."
        actions={
          <Button onClick={() => setValidateOpen(true)} className="h-9 bg-white text-black hover:bg-[#e5e5e5]">
            <ListChecks className="h-4 w-4" /> Validate list
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 border-t border-surface-active pt-4 lg:grid-cols-[360px_1fr]">
        {/* Summary */}
        <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-5">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-text-secondary" />
            <h2 className="text-sm font-semibold text-foreground">Results summary</h2>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
            <span className="text-sm text-muted-foreground">Total checked</span>
            <span className="tabular-nums text-sm font-semibold text-foreground">{counts.total.toLocaleString()}</span>
          </div>
          {summaryRows.map((s) => (
            <div key={s.label} className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
              <Pill tone={s.tone}>{s.label}</Pill>
              <span className="tabular-nums text-sm font-semibold text-foreground">{s.value.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* Results table */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Validation results</h2>
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-surface-subtle hover:bg-surface-subtle">
                  <TableHead>Email</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id} className="border-border">
                    <TableCell className="font-mono text-xs text-foreground">{r.email}</TableCell>
                    <TableCell><Pill tone={RESULT_TONE[r.result]}>{r.result}</Pill></TableCell>
                    <TableCell className="text-muted-foreground">{r.reason}</TableCell>
                    <TableCell className="text-right">
                      <RowActions items={[{ label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(r.id) }]} />
                    </TableCell>
                  </TableRow>
                ))}
                {results.length === 0 && (
                  <TableRow className="border-border hover:bg-transparent">
                    <TableCell colSpan={4} className="py-14 text-center text-sm text-text-secondary">No results yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableShell>
        </div>
      </div>

      <ValidateDialog open={validateOpen} onOpenChange={setValidateOpen} onValidate={addEmails} />
    </MainScreenWrapper>
  );
}

export default EmailValidationScreen;
