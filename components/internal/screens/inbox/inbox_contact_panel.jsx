"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Briefcase, ExternalLink, History, ShieldCheck, UserRound } from "lucide-react";
import { Badge, Button, LogoLoading, StatusPill } from "@geiger/ui";
import { listConversations, listContactConsents, listContactDeals } from "@/lib/supabase/conversations";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { formatDateTime, formatListTime } from "@/lib/inbox/format";
import { Avatar } from "./inbox_thread";
import {
  CONSENT_CHANNELS,
  CONSENT_MAP,
  CONVERSATION_STATUS_MAP,
  DEAL_STATUS_MAP,
  channelMeta,
  currency,
} from "./constants";

// Contact side panel: profile, consent per channel, cross-channel history (other threads, deliveries,
// tracked events) and CRM deals for whoever the open conversation is with.

const humanize = (name) => {
  const text = String(name || "").replace(/[._]/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "Event";
};

function Section({ icon: Icon, title, children, action }) {
  return (
    <section className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-secondary">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const Row = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 py-1 text-sm">
    <span className="shrink-0 text-text-secondary">{label}</span>
    <span className="min-w-0 truncate text-right text-foreground">{children}</span>
  </div>
);

export function ContactPanel({ projectId, conversation, contact, name, now, onOpenContact, onOpenConversation }) {
  const contactId = conversation?.contactId || null;
  const [data, setData] = useState({ key: null, consents: [], threads: [], deliveries: [], events: [], deals: [] });

  useEffect(() => {
    if (!projectId || !contactId) return undefined;
    let alive = true;
    Promise.all([
      listContactConsents(projectId, contactId),
      listConversations(projectId, { contactId, limit: 20 }),
      listDeliveries(projectId, { contactId, limit: 15 }),
      listTrackedEvents(projectId, { contactId, limit: 15 }),
      listContactDeals(projectId, contactId),
    ]).then(([consents, threads, deliveries, events, deals]) => {
      if (!alive) return;
      setData({ key: contactId, consents: consents ?? [], threads: threads ?? [], deliveries: deliveries ?? [], events: events ?? [], deals: deals ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [projectId, contactId]);

  const loading = Boolean(contactId) && data.key !== contactId;
  const consentByChannel = useMemo(() => new Map(data.consents.map((c) => [c.channel, c])), [data.consents]);
  const timeline = useMemo(() => {
    const items = [
      ...data.deliveries.map((d) => ({
        id: `d-${d.id}`,
        at: d.sentAt || d.createdAt,
        icon: channelMeta(d.channel).icon,
        title: `${channelMeta(d.channel).label} ${d.status.replace(/_/g, " ")}`,
        detail: d.subject || (d.sourceType === "inbox" ? "Inbox reply" : d.sourceType),
      })),
      ...data.events.map((e) => ({
        id: `e-${e.id}`,
        at: e.occurredAt,
        icon: e.properties?.channel ? channelMeta(e.properties.channel).icon : History,
        title: humanize(e.name),
        detail: e.properties?.keyword || e.properties?.page || e.url || e.properties?.channel || "",
      })),
    ];
    return items.filter((i) => i.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
  }, [data.deliveries, data.events]);
  const otherThreads = data.threads.filter((t) => t.id !== conversation?.id);

  if (!conversation) return null;

  const visitor = conversation.visitor || {};
  const sender = conversation.sender || {};

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-subtle" aria-label="Contact details">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="truncate text-xs text-text-secondary">{contact?.email || contact?.phone || (sender.handle ? `@${sender.handle}` : visitor.email) || "No contact details"}</p>
        </div>
        {contact ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Open contact" onClick={onOpenContact} className="text-muted-foreground hover:bg-surface-active hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!contact ? (
          <Section icon={UserRound} title="Profile">
            <p className="text-sm text-text-secondary">
              {conversation.kind === "comment"
                ? "This commenter isn't linked to a contact yet. A private reply or DM links them when they answer."
                : "Not linked to a contact yet. Once they share an email or phone number the thread links automatically."}
            </p>
            {visitor.page ? <Row label="Page">{visitor.page}</Row> : null}
            {visitor.location ? <Row label="Location">{visitor.location}</Row> : null}
          </Section>
        ) : (
          <>
            <Section icon={UserRound} title="Profile">
              {contact.email ? <Row label="Email">{contact.email}</Row> : null}
              {contact.phone ? <Row label="Phone">{contact.phone}</Row> : null}
              {sender.handle ? <Row label="Handle">@{sender.handle}</Row> : null}
              <Row label="Status"><span className="capitalize">{contact.status}</span></Row>
              <Row label="Lead score"><span className="tabular-nums">{contact.leadScore}</span></Row>
              {contact.timezone ? <Row label="Time zone">{contact.timezone}</Row> : null}
              {contact.tags?.length ? (
                <div className="flex flex-wrap gap-1 pt-1.5">
                  {contact.tags.map((t) => (
                    <Badge key={t} variant="outline">{t}</Badge>
                  ))}
                </div>
              ) : null}
            </Section>

            <Section icon={ShieldCheck} title="Consent">
              {loading ? (
                <div className="flex justify-center py-3"><LogoLoading size={32} /></div>
              ) : (
                <div className="space-y-1">
                  {CONSENT_CHANNELS.map((ch) => {
                    const c = consentByChannel.get(ch);
                    const Icon = channelMeta(ch).icon;
                    return (
                      <div key={ch} className="flex items-center justify-between gap-2 py-0.5 text-sm">
                        <span className="flex items-center gap-1.5 text-text-secondary">
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {channelMeta(ch).label}
                        </span>
                        {c ? (
                          <span title={[c.source, c.capturedAt ? formatDateTime(c.capturedAt) : ""].filter(Boolean).join(" · ")}>
                            <StatusPill status={c.status} map={CONSENT_MAP} />
                          </span>
                        ) : (
                          <span className="text-xs text-text-tertiary">No record</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section icon={History} title="Other conversations">
              {loading ? (
                <div className="flex justify-center py-3"><LogoLoading size={32} /></div>
              ) : otherThreads.length ? (
                <div className="-mx-1.5 space-y-0.5">
                  {otherThreads.slice(0, 6).map((t) => {
                    const Icon = channelMeta(t.channel).icon;
                    return (
                      <button key={t.id} type="button" onClick={() => onOpenConversation(t)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-surface-hover">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {channelMeta(t.channel).label}
                          {t.kind === "comment" ? " comment" : ""}
                        </span>
                        <StatusPill status={t.status} map={CONVERSATION_STATUS_MAP} />
                        <span className="w-10 shrink-0 text-right text-[11px] text-text-tertiary">{formatListTime(t.lastMessageAt, now)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">No other conversations.</p>
              )}
            </Section>

            <Section icon={History} title="Activity">
              {loading ? (
                <div className="flex justify-center py-3"><LogoLoading size={32} /></div>
              ) : timeline.length ? (
                <ol className="space-y-2">
                  {timeline.map((item) => (
                    <li key={item.id} className="flex gap-2 text-sm">
                      <item.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground">{item.title}</p>
                        {item.detail ? <p className="truncate text-xs text-text-secondary">{item.detail}</p> : null}
                      </div>
                      <span className="shrink-0 text-[11px] text-text-tertiary" title={formatDateTime(item.at)}>{formatListTime(item.at, now)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-text-secondary">No sends or tracked activity yet.</p>
              )}
            </Section>

            <Section icon={Briefcase} title="Deals">
              {loading ? (
                <div className="flex justify-center py-3"><LogoLoading size={32} /></div>
              ) : data.deals.length ? (
                <div className="space-y-1.5">
                  {data.deals.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-foreground">{d.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-text-secondary">{currency(d.value, d.currency)}</span>
                        <StatusPill status={d.status} map={DEAL_STATUS_MAP} />
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">No deals for this contact.</p>
              )}
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
