"use client";

import React, { useMemo, useState } from "react";
import { ListChecks, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  ScreenHeader,
  SectionCard,
  DataTable,
  EmptyState,
  Badge,
  ActionMenu,
} from "@geiger/ui";

const RESULT_TONE = { Valid: "success", Risky: "warning", Invalid: "danger", Unknown: "neutral" };

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
        <div className="space-y-4 py-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"jordan@example.com\nsales@example.com"}
            className="min-h-[160px] bg-background font-mono"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!text.trim()}>Validate</Button>
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
    { label: "Valid", value: counts.valid, tone: "success" },
    { label: "Risky", value: counts.risky, tone: "warning" },
    { label: "Invalid", value: counts.invalid, tone: "danger" },
    { label: "Unknown", value: counts.unknown, tone: "neutral" },
  ];

  const columns = [
    { key: "email", header: "Email", className: "font-mono text-xs text-foreground", render: (r) => r.email },
    { key: "result", header: "Result", render: (r) => <Badge variant={RESULT_TONE[r.result]}>{r.result}</Badge> },
    { key: "reason", header: "Reason", className: "text-muted-foreground", render: (r) => r.reason },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (r) => <ActionMenu items={[{ label: "Remove", icon: Trash2, destructive: true, onSelect: () => remove(r.id) }]} />,
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Email Validation"
        description="Verify addresses before you send to protect your sender reputation."
        actions={
          <Button onClick={() => setValidateOpen(true)}>
            <ListChecks className="h-4 w-4" /> Validate list
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Summary */}
        <SectionCard
          title={
            <span className="inline-flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-text-secondary" /> Results summary
            </span>
          }
          contentClassName="space-y-4"
        >
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
            <span className="text-sm text-muted-foreground">Total checked</span>
            <span className="tabular-nums text-sm font-semibold text-foreground">{counts.total.toLocaleString()}</span>
          </div>
          {summaryRows.map((s) => (
            <div key={s.label} className="flex items-center justify-between rounded-lg border border-border bg-surface-card px-4 py-3">
              <Badge variant={s.tone}>{s.label}</Badge>
              <span className="tabular-nums text-sm font-semibold text-foreground">{s.value.toLocaleString()}</span>
            </div>
          ))}
        </SectionCard>

        {/* Results table */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Validation results</h2>
          <DataTable
            columns={columns}
            data={results}
            getRowKey={(r) => r.id}
            empty={
              <EmptyState
                icon={ListChecks}
                title="No results yet."
                className="rounded-xl border border-border bg-surface-subtle"
                action={
                  <Button onClick={() => setValidateOpen(true)}>
                    <ListChecks className="h-4 w-4" /> Validate list
                  </Button>
                }
              />
            }
          />
        </div>
      </div>

      <ValidateDialog open={validateOpen} onOpenChange={setValidateOpen} onValidate={addEmails} />
    </MainScreenWrapper>
  );
}

export default EmailValidationScreen;
