"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  FileText,
  Hash,
  List as ListIcon,
  Loader2,
  Mail,
  MousePointerClick,
  Plus,
  Send,
  ShieldCheck,
  Tag as TagIcon,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import { getContact, updateContact } from "@/lib/supabase/contacts";
import { addListMembers, listContactMemberships, removeListMembers, updateListMemberStatus } from "@/lib/supabase/lists";
import { listConsents, recordConsent } from "@/lib/supabase/consents";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { CONSENT_CHANNELS, addressFor, latestConsentByChannel, normalizeEmail, isValidEmail } from "@/lib/audience/contact_model";
import { bandFor } from "@/lib/audience/scoring";
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
  EmptyState,
  Field,
  Input,
  LoadingArea,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingRow,
  SettingsList,
  StatusPill,
  Switch,
  Textarea,
  cn,
} from "@geiger/ui";
import {
  CONSENT_STATUS_MAP,
  CONTACT_STATUS_MAP,
  DESTRUCTIVE_GHOST,
  MEMBER_STATUS_MAP,
  OUTLINE_BUTTON,
  TAG_DOT,
  formatDate,
  formatDateTime,
} from "./constants";

const NAV = [
  { key: "profile", label: "Profile", icon: UserRound, desc: "Name, addresses and subscription status." },
  { key: "fields", label: "Custom fields", icon: Hash, desc: "Structured data defined in Tags & Fields." },
  { key: "tags", label: "Tags", icon: TagIcon, desc: "Labels used for targeting and automations." },
  { key: "lists", label: "Lists", icon: ListIcon, desc: "Lists this contact belongs to." },
  { key: "consent", label: "Consent", icon: ShieldCheck, desc: "Per-channel opt-in ledger with source, time and proof." },
  { key: "activity", label: "Activity", icon: Activity, desc: "Messages, engagement and tracked events, newest first." },
];

const toDraft = (c) => ({
  firstName: c.firstName,
  lastName: c.lastName,
  email: c.email,
  phone: c.phone,
  timezone: c.timezone,
  locale: c.locale,
  status: c.status,
  tags: c.tags,
  attributes: c.attributes,
});

function CustomFieldInput({ field, value, onChange, disabled }) {
  const id = `cf-${field.key}`;
  if (field.type === "boolean" || field.type === "select") {
    const current = value === true ? "true" : value === false ? "false" : value ? String(value) : "__unset";
    return (
      <Select
        value={current}
        disabled={disabled}
        onValueChange={(v) => onChange(v === "__unset" ? null : field.type === "boolean" ? v === "true" : v)}
      >
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__unset">Not set</SelectItem>
          {field.type === "boolean" ? (
            <>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </>
          ) : (
            field.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)
          )}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      id={id}
      disabled={disabled}
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={value ?? ""}
      onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
    />
  );
}

function TagEditor({ tags, catalog, onChange, disabled }) {
  const [draft, setDraft] = useState("");
  const colorOf = (t) => catalog.find((c) => c.name.toLowerCase() === t.toLowerCase())?.color;
  const add = (name) => {
    const t = name.trim();
    if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    onChange([...tags, t]);
  };
  const suggestions = catalog.filter((c) => !tags.some((t) => t.toLowerCase() === c.name.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tags.length ? (
          tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-active py-1 pl-2.5 pr-1 text-sm text-foreground">
              <span className={cn("h-2 w-2 rounded-full", TAG_DOT[colorOf(t)] || "bg-zinc-400")} />
              {t}
              {!disabled ? (
                <Button variant="ghost" size="icon-sm" className="size-5 text-text-secondary" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
                  <X className="h-3 w-3" />
                </Button>
              ) : null}
            </span>
          ))
        ) : (
          <p className="text-sm text-text-tertiary">No tags yet.</p>
        )}
      </div>
      {!disabled ? (
        <>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
                setDraft("");
              }
            }}
            placeholder="Type a tag and press Enter"
            aria-label="Add tag"
            className="max-w-sm"
          />
          {suggestions.length ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((c) => (
                <Button key={c.id} type="button" variant="outline" size="sm" className={cn(OUTLINE_BUTTON, "h-7 gap-1.5 px-2 text-xs")} onClick={() => add(c.name)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", TAG_DOT[c.color])} /> {c.name}
                </Button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RecordConsentDialog({ open, onOpenChange, onRecord }) {
  const [form, setForm] = useState({ channel: "email", status: "opted_in", source: "", note: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm({ channel: "email", status: "opted_in", source: "", note: "" });
  }
  const submit = async () => {
    if (!form.source.trim()) {
      toast.error("Say where this consent came from.");
      return;
    }
    setSaving(true);
    const ok = await onRecord(form);
    setSaving(false);
    if (ok) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record consent</DialogTitle>
          <DialogDescription>Adds a row to the ledger. Earlier rows stay as history; the newest one decides who can be messaged.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Channel">
              <Select value={form.channel} onValueChange={set("channel")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONSENT_CHANNELS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["opted_in", "opted_out", "pending"].map((s) => <SelectItem key={s} value={s}>{CONSENT_STATUS_MAP[s].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Source" htmlFor="rc-source" hint="Where it was captured, e.g. “Signed paper form at Lisbon summit”.">
            <Input id="rc-source" value={form.source} onChange={(e) => set("source")(e.target.value)} autoFocus />
          </Field>
          <Field label="Proof" htmlFor="rc-note" hint="Optional — a reference others can check (ticket, file, message link).">
            <Textarea id="rc-note" value={form.note} onChange={(e) => set("note")(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.source.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const proofSummary = (proof) => {
  if (!proof || typeof proof !== "object") return "—";
  const parts = [proof.method, proof.file_name, proof.form_id && `form ${proof.form_id}`, proof.message_id && `message ${proof.message_id}`, proof.note].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
};

const CHANNEL_LABEL = Object.fromEntries(CONSENT_CHANNELS.map((c) => [c.key, c.label]));

// Deliveries, opens/clicks, tracked events and consent changes merged into one newest-first feed.
function buildTimeline({ contact, deliveries, events, consents }) {
  const items = [];
  for (const d of deliveries) {
    const subject = d.subject || `${CHANNEL_LABEL[d.channel] || d.channel} message`;
    items.push({ id: `d-${d.id}`, at: d.sentAt || d.createdAt, icon: Send, title: `${d.status === "failed" || d.status === "not_sent" ? "Not delivered" : "Sent"}: ${subject}`, meta: `${CHANNEL_LABEL[d.channel] || d.channel} · ${d.status.replace(/_/g, " ")}${d.error ? ` · ${d.error}` : ""}` });
    if (d.openedAt) items.push({ id: `o-${d.id}`, at: d.openedAt, icon: Mail, title: `Opened: ${subject}`, meta: d.openCount > 1 ? `${d.openCount} opens` : "" });
    if (d.clickedAt) items.push({ id: `c-${d.id}`, at: d.clickedAt, icon: MousePointerClick, title: `Clicked a link in: ${subject}`, meta: d.clickCount > 1 ? `${d.clickCount} clicks` : "" });
  }
  for (const e of events) {
    const detail = e.url || Object.entries(e.properties || {}).slice(0, 2).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ");
    items.push({ id: `e-${e.id}`, at: e.occurredAt, icon: Zap, title: e.name, meta: [e.source, detail, e.revenue ? `${e.revenue} ${e.currency || ""}`.trim() : ""].filter(Boolean).join(" · "), mono: true });
  }
  for (const c of consents) {
    items.push({ id: `k-${c.id}`, at: c.capturedAt, icon: ShieldCheck, title: `${CONSENT_STATUS_MAP[c.status]?.label || c.status} · ${CHANNEL_LABEL[c.channel] || c.channel}`, meta: c.source });
  }
  if (contact.createdAt) items.push({ id: "created", at: contact.createdAt, icon: FileText, title: "Contact created", meta: `Source: ${contact.source}` });
  return items.filter((i) => i.at).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 150);
}

export function ContactDetail({ contactId, projectId, catalog, onBack, onChanged, onDelete }) {
  const { can } = useRbac();
  const canEdit = can("campaign.contact.edit");
  const canDelete = can("campaign.contact.delete");
  const [data, setData] = useState({ key: null });
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const loadKey = `${projectId}|${contactId}`;

  useEffect(() => {
    let alive = true;
    Promise.all([
      getContact(projectId, contactId),
      listContactMemberships(projectId, contactId),
      listConsents(projectId, { contactId }),
      listDeliveries(projectId, { contactId, limit: 200 }),
      listTrackedEvents(projectId, { contactId, limit: 200 }),
    ]).then(([contact, memberships, consents, deliveries, events]) => {
      if (!alive) return;
      setData({ key: loadKey, contact, memberships: memberships ?? [], consents: consents ?? [], deliveries: deliveries ?? [], events: events ?? [] });
      setDraft(contact ? toDraft(contact) : null);
    });
    return () => {
      alive = false;
    };
  }, [projectId, contactId, loadKey]);

  const contact = data.contact;
  const timeline = useMemo(
    () => (contact ? buildTimeline({ contact, deliveries: data.deliveries, events: data.events, consents: data.consents }) : []),
    [contact, data.deliveries, data.events, data.consents],
  );
  const latestConsent = useMemo(() => latestConsentByChannel(data.consents || []), [data.consents]);

  if (data.key !== loadKey) return <LoadingArea size={88} label="Loading contact" className="min-h-[60vh]" />;

  if (!contact || !draft) {
    return (
      <MainScreenWrapper>
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={UserRound}
            title="Contact not found"
            description="It may have been deleted, or it belongs to another project."
            action={<Button variant="outline" className={OUTLINE_BUTTON} onClick={onBack}>Back to contacts</Button>}
          />
        </div>
      </MainScreenWrapper>
    );
  }

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const setAttribute = (key, value) =>
    setDraft((d) => {
      const attributes = { ...d.attributes };
      if (value === null || value === undefined || value === "") delete attributes[key];
      else attributes[key] = value;
      return { ...d, attributes };
    });
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(contact));

  const save = async () => {
    const email = normalizeEmail(draft.email);
    if (email && !isValidEmail(email)) {
      toast.error("That email address doesn't look right.");
      return;
    }
    if (!email && !draft.phone.trim()) {
      toast.error("A contact needs an email address or a phone number.");
      return;
    }
    setSaving(true);
    const statusChanged = draft.status !== contact.status;
    const patch = {
      ...draft,
      email,
      unsubscribedAt: draft.status === "unsubscribed" ? contact.unsubscribedAt || new Date().toISOString() : null,
    };
    const saved = await updateContact(contact.id, patch);
    setSaving(false);
    if (!saved) {
      toast.error("Couldn't save — check the email isn't used by another contact.");
      return;
    }
    if (statusChanged && saved.email && ["subscribed", "unsubscribed"].includes(saved.status)) {
      const user = await getUser();
      const row = await recordConsent(
        projectId,
        {
          contactId: saved.id,
          channel: "email",
          status: saved.status === "unsubscribed" ? "opted_out" : "opted_in",
          source: saved.status === "unsubscribed" ? "Unsubscribed by a teammate" : "Resubscribed by a teammate",
          proof: { method: "manual", recorded_by: user?.id ?? null },
        },
        { createdBy: user?.id ?? null },
      );
      if (row) setData((d) => ({ ...d, consents: [row, ...d.consents] }));
    }
    setData((d) => ({ ...d, contact: saved }));
    setDraft(toDraft(saved));
    onChanged?.(saved);
    toast.success("Contact saved.");
  };

  const toggleList = async (list, on) => {
    const user = await getUser();
    const previous = data.memberships;
    if (on) {
      setData((d) => ({ ...d, memberships: [...d.memberships.filter((m) => m.listId !== list.id), { id: `tmp-${list.id}`, listId: list.id, contactId: contact.id, status: "subscribed" }] }));
      const ok = await addListMembers(projectId, list.id, [contact.id], { createdBy: user?.id ?? null });
      if (!ok) {
        setData((d) => ({ ...d, memberships: previous }));
        toast.error(`Couldn't add to ${list.name}.`);
        return;
      }
      toast.success(`Added to ${list.name}.`);
    } else {
      setData((d) => ({ ...d, memberships: d.memberships.filter((m) => m.listId !== list.id) }));
      const ok = await removeListMembers(list.id, [contact.id]);
      if (!ok) {
        setData((d) => ({ ...d, memberships: previous }));
        toast.error(`Couldn't remove from ${list.name}.`);
        return;
      }
      toast.success(`Removed from ${list.name}.`);
    }
  };

  const setMemberStatus = async (list, status) => {
    const previous = data.memberships;
    setData((d) => ({ ...d, memberships: d.memberships.map((m) => (m.listId === list.id ? { ...m, status } : m)) }));
    const ok = await updateListMemberStatus(list.id, [contact.id], status);
    if (!ok) {
      setData((d) => ({ ...d, memberships: previous }));
      toast.error("Couldn't change the membership status.");
    }
  };

  const handleRecordConsent = async (form) => {
    const user = await getUser();
    const row = await recordConsent(
      projectId,
      {
        contactId: contact.id,
        channel: form.channel,
        status: form.status,
        source: form.source.trim(),
        proof: { method: "manual", recorded_by: user?.id ?? null, note: form.note.trim() || null },
      },
      { createdBy: user?.id ?? null },
    );
    if (!row) {
      toast.error("Couldn't record consent.");
      return false;
    }
    setData((d) => ({ ...d, consents: [row, ...d.consents] }));
    toast.success(`${CONSENT_STATUS_MAP[row.status].label} recorded for ${CHANNEL_LABEL[row.channel]}.`);
    return true;
  };

  const band = bandFor(contact.leadScore);
  const memberByList = Object.fromEntries(data.memberships.map((m) => [m.listId, m]));

  const consentRows = CONSENT_CHANNELS.map((c) => ({ ...c, latest: latestConsent[c.key] || null, address: addressFor(contact, c.key) }));

  return (
    <>
      <EditorShell
        back={{ label: "Contacts", onClick: onBack }}
        title={contact.name}
        status={contact.status}
        statusMap={CONTACT_STATUS_MAP}
        badges={
          <>
            <Badge variant={band.key === "hot" ? "danger" : band.key === "warm" ? "warning" : "neutral"}>
              Score {contact.leadScore} · {band.label}
            </Badge>
            <span className="text-xs text-text-tertiary">Added {formatDate(contact.createdAt)} · {contact.source}</span>
          </>
        }
        actions={
          <>
            {canDelete ? (
              <Button variant="ghost" size="icon" aria-label="Delete contact" className={DESTRUCTIVE_GHOST} onClick={() => onDelete(contact)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="outline" className={OUTLINE_BUTTON} disabled={!dirty || saving} onClick={save}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
              </Button>
            ) : null}
          </>
        }
        nav={NAV}
        defaultSection="profile"
      >
        {({ active }) => (
          <>
            {active === "profile" ? (
              <SectionCard bare title="Contact details" description="Who this contact is, how to reach them and whether they receive sends.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First name" htmlFor="ce-first">
                    <Input id="ce-first" value={draft.firstName} disabled={!canEdit} onChange={(e) => set("firstName")(e.target.value)} />
                  </Field>
                  <Field label="Last name" htmlFor="ce-last">
                    <Input id="ce-last" value={draft.lastName} disabled={!canEdit} onChange={(e) => set("lastName")(e.target.value)} />
                  </Field>
                  <Field label="Email address" htmlFor="ce-email" hint="Unique within this project.">
                    <Input id="ce-email" type="email" value={draft.email} disabled={!canEdit} onChange={(e) => set("email")(e.target.value)} />
                  </Field>
                  <Field label="Phone" htmlFor="ce-phone" hint="Used for SMS, WhatsApp and RCS.">
                    <Input id="ce-phone" value={draft.phone} disabled={!canEdit} onChange={(e) => set("phone")(e.target.value)} placeholder="+351 912 345 678" />
                  </Field>
                  <Field label="Timezone" htmlFor="ce-tz" hint="IANA name, e.g. Europe/Lisbon. Used for timezone sends.">
                    <Input id="ce-tz" value={draft.timezone} disabled={!canEdit} onChange={(e) => set("timezone")(e.target.value)} placeholder="Europe/Lisbon" />
                  </Field>
                  <Field label="Language" htmlFor="ce-locale">
                    <Input id="ce-locale" value={draft.locale} disabled={!canEdit} onChange={(e) => set("locale")(e.target.value)} placeholder="en-US" />
                  </Field>
                  <Field label="Subscription status" hint="Bounced and complained are set by the sending pipeline.">
                    <Select value={draft.status} onValueChange={set("status")} disabled={!canEdit}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CONTACT_STATUS_MAP).map(([value, { label }]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </SectionCard>
            ) : null}

            {active === "fields" ? (
              <SectionCard bare title="Field values" description="This contact's value for each custom field in your catalog.">
                {catalog.customFields.length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {catalog.customFields.map((f) => (
                      <Field key={f.id} label={`${f.label}${f.required ? " *" : ""}`} htmlFor={`cf-${f.key}`} hint={f.description || undefined}>
                        <CustomFieldInput field={f} value={draft.attributes[f.key]} disabled={!canEdit} onChange={(v) => setAttribute(f.key, v)} />
                      </Field>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-surface-subtle">
                    <EmptyState icon={Hash} title="No custom fields" description="Define fields in Tags & Fields to store structured data on contacts." className="py-8" />
                  </div>
                )}
                {Object.keys(draft.attributes).filter((k) => !catalog.customFields.some((f) => f.key === k)).length ? (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-secondary">Other stored values</p>
                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      {Object.entries(draft.attributes)
                        .filter(([k]) => !catalog.customFields.some((f) => f.key === k))
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3">
                            <dt className="font-mono text-xs text-text-secondary">{k}</dt>
                            <dd className="truncate text-foreground">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                ) : null}
              </SectionCard>
            ) : null}

            {active === "tags" ? (
              <SectionCard bare title="Applied tags" description="The tags on this contact, used by segments and automations.">
                <TagEditor tags={draft.tags} catalog={catalog.tags} onChange={set("tags")} disabled={!canEdit} />
              </SectionCard>
            ) : null}

            {active === "lists" ? (
              <SectionCard bare title="Memberships" description="Switch a list on to add this contact, then set their status on it.">
                {catalog.lists.length ? (
                  <SettingsList>
                    {catalog.lists.map((l) => {
                      const member = memberByList[l.id];
                      return (
                        <SettingRow
                          key={l.id}
                          title={l.name}
                          description={l.description || (l.doubleOptIn ? "Double opt-in list" : "Single opt-in list")}
                          control={
                            <div className="flex items-center gap-3">
                              {member ? (
                                <Select value={member.status} onValueChange={(v) => setMemberStatus(l, v)} disabled={!canEdit}>
                                  <SelectTrigger size="sm" className="w-36" aria-label={`Status on ${l.name}`}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(MEMBER_STATUS_MAP).map(([value, { label }]) => (
                                      <SelectItem key={value} value={value}>{label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : null}
                              <Switch checked={!!member} disabled={!canEdit} onCheckedChange={(on) => toggleList(l, on)} aria-label={`Member of ${l.name}`} />
                            </div>
                          }
                        />
                      );
                    })}
                  </SettingsList>
                ) : (
                  <div className="rounded-xl border border-border bg-surface-subtle">
                    <EmptyState icon={ListIcon} title="No lists yet" description="Create a list in Lists, then add this contact to it here." className="py-8" />
                  </div>
                )}
              </SectionCard>
            ) : null}

            {active === "consent" ? (
              <div className="space-y-5">
                {canEdit ? (
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setConsentOpen(true)}>
                      <Plus className="h-4 w-4" /> Record consent
                    </Button>
                  </div>
                ) : null}
                <DataTable
                  columns={[
                    { key: "channel", header: "Channel", render: (r) => <span className="font-medium text-foreground">{r.label}</span> },
                    { key: "address", header: "Address", className: "max-w-48 truncate text-muted-foreground", render: (r) => r.address || <span className="text-text-tertiary">No address</span> },
                    { key: "status", header: "Consent", render: (r) => <StatusPill status={r.latest?.status || "none"} map={CONSENT_STATUS_MAP} /> },
                    { key: "source", header: "Source", className: "text-muted-foreground", render: (r) => r.latest?.source || "—" },
                    { key: "captured", header: "Captured", className: "whitespace-nowrap text-muted-foreground", render: (r) => formatDateTime(r.latest?.capturedAt) },
                  ]}
                  data={consentRows}
                  getRowKey={(r) => r.key}
                />
                <SectionCard title="Ledger history" description="Every consent change, newest first. Rows are never edited or removed." bodyPadding={false}>
                  {data.consents.length ? (
                    <ul className="divide-y divide-border">
                      {data.consents.map((c) => (
                        <li key={c.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <StatusPill status={c.status} map={CONSENT_STATUS_MAP} />
                              <span className="text-sm font-medium text-foreground">{CHANNEL_LABEL[c.channel] || c.channel}</span>
                              <span className="truncate text-sm text-text-secondary">{c.source}</span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-text-tertiary">
                              Proof: {proofSummary(c.proof)}
                              {c.ip ? ` · IP ${c.ip}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-text-secondary">{formatDateTime(c.capturedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={ShieldCheck} title="No consent recorded" description="Email can still be sent to subscribed contacts; SMS, WhatsApp and social channels need an opt-in first." className="py-10" />
                  )}
                </SectionCard>
              </div>
            ) : null}

            {active === "activity" ? (
              <SectionCard bodyPadding={false}>
                {timeline.length ? (
                  <ol className="divide-y divide-border">
                    {timeline.map((item) => {
                      const Icon = item.icon;
                      return (
                        <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-card text-text-secondary">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={cn("truncate text-sm text-foreground", item.mono && "font-mono text-xs")}>{item.title}</p>
                            {item.meta ? <p className="truncate text-xs text-text-secondary">{item.meta}</p> : null}
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-text-tertiary">{formatDateTime(item.at)}</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <EmptyState icon={Activity} title="No activity yet" description="Sends, opens, clicks and tracked events for this contact appear here." className="py-10" />
                )}
              </SectionCard>
            ) : null}
          </>
        )}
      </EditorShell>
      <RecordConsentDialog open={consentOpen} onOpenChange={setConsentOpen} onRecord={handleRecordConsent} />
    </>
  );
}
