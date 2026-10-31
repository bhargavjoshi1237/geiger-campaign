"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Code, FileCode, KeyRound, Loader2, Plus } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useCan } from "@/context/rbac-context";
import { apiPost } from "@/lib/api/client";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { listApiKeys, normalizeApiKey } from "@/lib/supabase/api_keys";
import { listTransactionalTemplates } from "@/lib/supabase/transactional_templates";
import { sampleData } from "@/lib/channels/transactional_render";
import { EXPIRY_OPTIONS } from "@/lib/integrations/scopes";
import { SecretDialog } from "@/components/internal/screens/integrations/shared/secret_dialog";
import {
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  ScreenHeader,
  SectionCard,
  SegmentedTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatsBar,
  StatusPill,
} from "@geiger/ui";
import {
  CodeBlock,
  CopyField,
  DELIVERY_STATUS_MAP,
  OUTLINE_BUTTON,
  SectionLoading,
  deliveryStats,
  formatRelative,
  useChannelStatus,
  useNow,
} from "@/components/internal/screens/channels/channels_kit";

// The developer path for transactional email: POST /api/v1/messages with a secret key holding the
// messages:send scope. Examples point at this deployment's endpoint and the project's real active
// templates; recent sends come from campaign.deliveries (source "transactional").

const INTEGRATION_MANAGE = "campaign.integration.manage";

const KEY_STATUS_MAP = {
  active: { label: "Active", variant: "success" },
  expired: { label: "Expired", variant: "warning" },
  revoked: { label: "Revoked", variant: "neutral" },
};

// What POST /api/v1/messages answers (app/api/v1/messages/route.js).
const RESPONSES = [
  ["202", "Accepted — handed to the provider. Body: { id, status }."],
  ["200", "Duplicate Idempotency-Key — the original message's id and status, nothing re-sent."],
  ["400", "Bad request — missing to, subject/html, or a malformed body."],
  ["401", "Missing or invalid key, or the key lacks messages:send."],
  ["404", "No transactional template with that key."],
  ["409", "The template exists but isn't active."],
  ["422", "Missing required template data, or the message was blocked (status not_sent)."],
  ["502", "The provider rejected or didn't confirm the send; error explains why."],
];

const EXAMPLE_TABS = [
  { value: "template", label: "Template" },
  { value: "raw", label: "Raw HTML" },
  { value: "node", label: "Node.js" },
  { value: "status", label: "Check status" },
];

const shellQuote = (obj) => JSON.stringify(obj, null, 2).replace(/'/g, "'\\''");

function examples(url, template) {
  const endpoint = url || "https://<your-deployment>/api/v1/messages";
  const templateBody = { to: "customer@example.com", template: template?.key || "order_receipt", data: template ? sampleData(template) : { order_id: "48213" } };
  const auth = `  -H "Authorization: Bearer $GEIGER_SECRET_KEY" \\\n  -H "Content-Type: application/json" \\`;
  return {
    template: `${template ? "" : "# Create and activate a transactional template first — this key is a placeholder.\n"}curl -X POST ${endpoint} \\
${auth}
  -H "Idempotency-Key: ${template?.key || "order_receipt"}-48213" \\
  -d '${shellQuote(templateBody)}'`,
    raw: `curl -X POST ${endpoint} \\
${auth}
  -d '${shellQuote({ to: "customer@example.com", subject: "Your password was changed", html: "<p>If this wasn't you, reset it now.</p>" })}'`,
    node: `const res = await fetch("${endpoint}", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.GEIGER_SECRET_KEY}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": \`receipt-\${order.id}\`, // retries never send twice
  },
  body: JSON.stringify(${JSON.stringify(templateBody, null, 2).replace(/\n/g, "\n  ")}),
});
const { id, status, error } = await res.json(); // 202 { id, status: "sent" }`,
    status: `curl ${endpoint}/<message id> \\
  -H "Authorization: Bearer $GEIGER_SECRET_KEY"

# -> { "id": "…", "status": "delivered", "to": "customer@example.com", "sentAt": "…", "openedAt": null, … }`,
  };
}

function CreateSendKeyDialog({ open, onOpenChange, onCreate }) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give the key a name.");
      return;
    }
    setPending(true);
    const ok = await onCreate({ name: name.trim(), kind: "secret", scopes: ["messages:send"], expiry });
    setPending(false);
    if (ok) {
      setName("");
      setExpiry("never");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a sending key</DialogTitle>
          <DialogDescription>A secret key with only the messages:send scope. Add scopes later in API Keys.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Key name" htmlFor="ek-name">
            <Input id="ek-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production web server" autoFocus />
          </Field>
          <Field label="Expires">
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Create key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ready = (ok, okLabel, missingLabel) => <Badge variant={ok ? "success" : "warning"}>{ok ? okLabel : missingLabel}</Badge>;

export function EmailApiScreen() {
  const { projectId, openRecordInTab } = useWorkspaceUrl();
  const { status, loading: statusLoading } = useChannelStatus();
  const canIssue = useCan(INTEGRATION_MANAGE);
  const now = useNow();
  const [sends, setSends] = useState([]);
  const [keys, setKeys] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("template");
  const [createOpen, setCreateOpen] = useState(false);
  const [issued, setIssued] = useState(null);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([
      listDeliveries(projectId, { sourceType: "transactional", since: new Date(now - 30 * 86_400_000).toISOString(), limit: 5000 }),
      listApiKeys(projectId),
      listTransactionalTemplates(projectId),
    ]).then(([deliveries, apiKeys, rows]) => {
      if (!alive) return;
      setSends(deliveries ?? []);
      setKeys(apiKeys ?? []);
      setTemplates(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, now]);

  const sendKeys = useMemo(() => keys.filter((k) => k.kind === "secret" && k.scopes.includes("messages:send")), [keys]);
  const keysPager = usePagination(sendKeys);
  const activeKeys = sendKeys.filter((k) => k.status === "active");
  const activeTemplates = useMemo(() => templates.filter((t) => t.status === "active"), [templates]);
  const stats = useMemo(() => deliveryStats(sends, { label: "API sends" }), [sends]);
  const code = useMemo(() => examples(status?.urls?.messagesApi, activeTemplates[0]), [status, activeTemplates]);
  const templateKeyById = useMemo(() => new Map(templates.map((t) => [t.id, t.key])), [templates]);

  const handleCreate = async (input) => {
    const res = await apiPost(`/api/projects/${projectId}/integrations/api-keys`, input);
    if (!res.ok) {
      toast.error(res.error || "Couldn't create the key.");
      return false;
    }
    const key = normalizeApiKey(res.data.apiKey);
    setKeys((prev) => [key, ...prev]);
    setIssued({ title: "Copy your sending key", name: key.name, value: res.data.key });
    return true;
  };

  const keyColumns = [
    {
      key: "name",
      header: "Key",
      render: (k) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-foreground">{k.name}</span>
          <span className="truncate font-mono text-xs text-text-secondary">{k.prefix}…</span>
        </div>
      ),
    },
    { key: "scopes", header: "Scopes", className: "max-w-[240px] truncate font-mono text-xs text-muted-foreground", render: (k) => k.scopes.join(", ") },
    { key: "used", header: "Last used", className: "whitespace-nowrap text-muted-foreground", render: (k) => formatRelative(k.lastUsedAt, now) },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (k) => <StatusPill status={k.status} map={KEY_STATUS_MAP} /> },
  ];

  const sendColumns = [
    {
      key: "to",
      header: "Recipient",
      render: (d) => (
        <div className="flex min-w-0 max-w-[320px] flex-col">
          <span className="truncate font-medium text-foreground">{d.to}</span>
          <span className="truncate text-xs text-text-secondary">{d.subject || "—"}</span>
        </div>
      ),
    },
    {
      key: "template",
      header: "Template",
      className: "whitespace-nowrap font-mono text-xs text-muted-foreground",
      render: (d) => d.templateKey || templateKeyById.get(d.sourceId) || (d.channel === "email" ? "raw html" : d.channel),
    },
    { key: "status", header: "Status", className: "whitespace-nowrap", render: (d) => <StatusPill status={d.status} map={DELIVERY_STATUS_MAP} /> },
    { key: "at", header: "When", align: "right", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (d) => formatRelative(d.createdAt, now) },
  ];

  const createButton = canIssue ? (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4" /> Create sending key
    </Button>
  ) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Email API" description="Send transactional email from your servers over HTTPS with a secret key." actions={createButton} />

      <StatsBar stats={stats} />

      {loading || statusLoading ? (
        <SectionLoading label="Loading the Email API" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            <SectionCard title="Setup" description="Everything a send needs, checked on this deployment.">
              <SettingsList>
                <SettingRow
                  title="Email delivery"
                  description={status?.email?.configured ? `Leaves through Geiger Dash (${status.email.apiHost}).` : "Set GEIGER_EMAIL_API_URL and GEIGER_EMAIL_API_KEY; until then sends answer not_sent."}
                  control={ready(status?.email?.configured, "Configured", "Not configured")}
                />
                <SettingRow
                  title="Server access"
                  description={status?.server?.admin ? "The API can verify keys and log deliveries." : "SUPABASE_SERVICE_ROLE_KEY isn't set — the API answers 503."}
                  control={ready(status?.server?.admin, "Ready", "Missing")}
                />
                <SettingRow
                  title="Sending keys"
                  description={activeKeys.length ? `${activeKeys.length} active secret key${activeKeys.length === 1 ? "" : "s"} with messages:send.` : "No active key can send yet."}
                  control={ready(activeKeys.length > 0, `${activeKeys.length} active`, "None")}
                />
                <SettingRow
                  title="Active templates"
                  description={activeTemplates.length ? "Reference them by key; raw subject + html also works." : "Optional — raw subject + html works without one."}
                  control={
                    <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => openRecordInTab(null, "Transactional Templates")}>
                      <FileCode className="h-3.5 w-3.5" /> {activeTemplates.length}
                    </Button>
                  }
                />
              </SettingsList>
            </SectionCard>

            <SectionCard title="Send a message" description="One recipient per request. Add an Idempotency-Key so retries never send twice." contentClassName="space-y-4">
              <CopyField label="Endpoint" value={status?.urls?.messagesApi ? `POST ${status.urls.messagesApi}` : ""} htmlFor="email-api-endpoint" />
              <SegmentedTabs tabs={EXAMPLE_TABS} value={tab} onChange={setTab} />
              <CodeBlock label="example">{code[tab]}</CodeBlock>
              {tab === "template" && activeTemplates[0] ? (
                <p className="text-xs text-text-secondary">
                  Uses <span className="font-mono text-foreground">{activeTemplates[0].key}</span> with its sample data. SMS and WhatsApp use the same endpoint with{" "}
                  <span className="font-mono">&quot;channel&quot;</span>.
                </p>
              ) : null}
            </SectionCard>
          </div>

          <SectionCard title="Responses" description="Errors come back as JSON with an error message.">
            <div className="divide-y divide-border rounded-lg border border-border">
              {RESPONSES.map(([httpCode, meaning]) => (
                <div key={httpCode} className="flex items-start gap-4 px-3 py-2">
                  <span className="w-10 shrink-0 font-mono text-xs text-foreground">{httpCode}</span>
                  <span className="text-xs text-text-secondary">{meaning}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            bare
            title={
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-text-secondary" /> Keys that can send
              </span>
            }
            action={
              <Button variant="ghost" size="sm" className="text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => openRecordInTab(null, "API Keys")}>
                API keys <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            }
          >
            <div className="space-y-5">
              <DataTable
                columns={keyColumns}
                data={keysPager.pageItems}
                getRowKey={(k) => k.id}
                onRowClick={(k) => openRecordInTab(k.id, "API Keys")}
                empty={
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-subtle px-6 py-10 text-center">
                    <span className="text-sm text-text-secondary">No secret key has the messages:send scope.</span>
                    {createButton}
                  </div>
                }
              />
              <ListPagination {...keysPager} itemLabel="keys" />
            </div>
          </SectionCard>

          <SectionCard
            bare
            title={
              <span className="flex items-center gap-2">
                <Code className="h-4 w-4 text-text-secondary" /> Recent API sends
              </span>
            }
            action={
              <Button variant="ghost" size="sm" className="text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => openRecordInTab(null, "Message Logs")}>
                Message logs <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            }
          >
            <DataTable
              columns={sendColumns}
              data={sends.slice(0, 10)}
              getRowKey={(d) => d.id}
              onRowClick={(d) => openRecordInTab(d.id, "Message Logs")}
              empty={
                <div className="rounded-xl border border-border bg-surface-subtle px-6 py-10 text-center text-sm text-text-secondary">
                  Nothing sent through the API in the last 30 days.
                </div>
              }
            />
          </SectionCard>
        </>
      )}

      <CreateSendKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      <SecretDialog issued={issued} onClose={() => setIssued(null)} />
    </MainScreenWrapper>
  );
}

export default EmailApiScreen;
