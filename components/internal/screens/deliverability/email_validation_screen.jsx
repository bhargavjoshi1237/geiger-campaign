"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { ListChecks, Mail, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
  ScreenHeader,
  StatsBar,
  Toolbar,
  SearchInput,
  DataTable,
  EmptyState,
  StatusPill,
  ActionMenu,
  Field,
  SectionCard,
  SettingsList,
  SettingRow,
} from "@geiger/ui";

const RESULT_MAP = {
  Valid: { label: "Valid", variant: "success" },
  Risky: { label: "Risky", variant: "warning" },
  Invalid: { label: "Invalid", variant: "danger" },
  Unknown: { label: "Unknown", variant: "neutral" },
};

const RESULT_FILTER_OPTIONS = [
  { value: "all", label: "All results" },
  ...Object.keys(RESULT_MAP).map((r) => ({ value: r, label: r })),
];

const QUEUED = { result: "Unknown", reason: "Queued for verification" };

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

const RESULT_NAV = [
  { key: "address", label: "Address", icon: Mail, desc: "The email address that was verified." },
  { key: "result", label: "Result", icon: ListChecks, desc: "What verification found for this address." },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

function ValidateDialog({ open, onOpenChange, onValidate }) {
  const [text, setText] = useState("");

  const submit = () => {
    const emails = text
      .split(/[\n,]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast.error("Paste at least one address to validate.");
      return;
    }
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
        <div className="grid gap-4">
          <Field label="Addresses" htmlFor="ev-emails" hint="Separate addresses with new lines or commas.">
            <Textarea
              id="ev-emails"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"jordan@example.com\nsales@example.com"}
              className="min-h-[160px] font-mono"
              autoFocus
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!text.trim()}>Validate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Editable slice of a result row; compared against the row to derive dirty state.
const toDraft = (r) => ({ email: r.email });

function ResultEditor({ record, onBack, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => toDraft(record));
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(record));

  const save = () => {
    const email = draft.email.trim();
    if (!email) {
      toast.error("Add an email address first.");
      return;
    }
    // A changed address has to be verified again.
    const patch = email === record.email ? { email } : { email, ...QUEUED };
    onSave(record.id, patch);
    setDraft(toDraft({ ...record, ...patch }));
  };

  return (
    <EditorShell
      back={{ label: "Back", onClick: onBack }}
      title={draft.email || "Untitled address"}
      status={record.result}
      statusMap={RESULT_MAP}
      badges={<span className="text-xs text-text-tertiary">{record.reason}</span>}
      actions={
        <>
          <Button variant="ghost" size="icon" aria-label="Delete result" className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400 dark:hover:text-red-400" onClick={() => onDelete(record)}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </>
      }
      nav={RESULT_NAV}
      defaultSection="address"
    >
      {({ active }) => (
        <>
          {active === "address" ? (
            <SectionCard bare title="Email to verify" description="Edit the address to queue it for a fresh check.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email address" htmlFor="eve-email" hint="Changing the address queues it for verification again.">
                  <Input id="eve-email" type="email" value={draft.email} onChange={(e) => setDraft({ email: e.target.value })} placeholder="name@company.com" className="font-mono" />
                </Field>
              </div>
            </SectionCard>
          ) : null}

          {active === "result" ? (
            <SectionCard bare title="Verification outcome" description="Whether it's safe to send here, and why.">
              <SettingsList>
                <SettingRow
                  title="Result"
                  description="Whether it's safe to send to this address."
                  control={<StatusPill status={record.result} map={RESULT_MAP} />}
                />
                <SettingRow
                  title="Reason"
                  description="The check that decided the result."
                  control={<span className="text-sm text-muted-foreground">{record.reason}</span>}
                />
              </SettingsList>
            </SectionCard>
          ) : null}
        </>
      )}
    </EditorShell>
  );
}

export function EmailValidationScreen() {
  const [results, setResults] = useState(INITIAL);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const [validateOpen, setValidateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { recordId, openRecord, closeRecord } = useWorkspaceUrl();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return results.filter((r) => {
      if (resultFilter !== "all" && r.result !== resultFilter) return false;
      if (q && !`${r.email} ${r.reason}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [results, query, resultFilter]);

  const stats = useMemo(() => {
    const count = (result) => results.filter((r) => r.result === result).length.toLocaleString("en-US");
    return [
      { label: "Total checked", value: results.length.toLocaleString("en-US") },
      { label: "Valid", value: count("Valid") },
      { label: "Risky", value: count("Risky") },
      { label: "Invalid", value: count("Invalid") },
    ];
  }, [results]);

  const pager = usePagination(filtered, { resetKey: `${query}|${resultFilter}` });

  const addEmails = (emails) => {
    const added = emails.map((email) => ({ id: crypto.randomUUID(), email, ...QUEUED }));
    setResults((p) => [...added, ...p]);
    toast.success(`Queued ${emails.length} ${emails.length === 1 ? "address" : "addresses"} for verification.`);
  };

  const handleSave = (id, patch) => {
    setResults((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    toast.success(patch.result ? "Address saved and queued for verification." : "Address saved.");
  };

  const revalidate = (r) => {
    setResults((p) => p.map((x) => (x.id === r.id ? { ...x, ...QUEUED } : x)));
    toast.success(`Queued ${r.email} for verification.`);
  };

  const handleDelete = (r) => {
    setDeleteTarget(null);
    setResults((p) => p.filter((x) => x.id !== r.id));
    if (String(r.id) === recordId) closeRecord();
    toast.success(`Deleted the result for ${r.email}.`);
  };

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete result</DialogTitle>
          <DialogDescription>
            Delete the result for <span className="font-medium text-foreground">{deleteTarget?.email}</span>? This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={() => handleDelete(deleteTarget)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const open = results.find((r) => String(r.id) === recordId);
  if (open) {
    return (
      <>
        <ResultEditor key={open.id} record={open} onBack={closeRecord} onSave={handleSave} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  const filtersActive = query || resultFilter !== "all";

  const columns = [
    { key: "email", header: "Email", className: "font-mono text-xs text-foreground", render: (r) => r.email },
    { key: "result", header: "Result", className: "whitespace-nowrap", render: (r) => <StatusPill status={r.result} map={RESULT_MAP} /> },
    { key: "reason", header: "Reason", className: "text-muted-foreground", render: (r) => r.reason },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <ActionMenu
          label={`Actions for ${r.email}`}
          items={[
            { label: "Edit", icon: Pencil, onSelect: () => openRecord(String(r.id)) },
            { label: "Validate again", icon: RefreshCw, onSelect: () => revalidate(r) },
            { separator: true },
            { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(r) },
          ]}
        />
      ),
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

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown value={resultFilter} onValueChange={setResultFilter} options={RESULT_FILTER_OPTIONS} height="h-9" />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Search addresses…" />
      </Toolbar>

      <div className="space-y-5">
        <DataTable
          columns={columns}
          data={pager.pageItems}
          getRowKey={(r) => r.id}
          onRowClick={(r) => openRecord(String(r.id))}
          empty={
            <div className="rounded-xl border border-border bg-surface-subtle">
              <EmptyState
                icon={ListChecks}
                title={filtersActive ? "No matches" : "No results yet"}
                description={filtersActive ? "Try a different search or filter." : "Paste a list of addresses to verify them before you send."}
                action={
                  filtersActive ? (
                    <Button
                      variant="outline"
                      className={OUTLINE_BUTTON}
                      onClick={() => {
                        setQuery("");
                        setResultFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button onClick={() => setValidateOpen(true)}>
                      <ListChecks className="h-4 w-4" /> Validate list
                    </Button>
                  )
                }
              />
            </div>
          }
        />
        <ListPagination {...pager} itemLabel="results" />
      </div>

      <ValidateDialog open={validateOpen} onOpenChange={setValidateOpen} onValidate={addEmails} />
      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default EmailValidationScreen;
