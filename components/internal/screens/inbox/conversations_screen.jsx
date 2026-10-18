"use client";

import React, { useMemo, useState } from "react";
import { Mail, Send } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { Button, Textarea, cn, ScreenHeader, Badge, SectionCard, SegmentedTabs, EmptyState } from "@geiger/ui";

const STATUS_FILTERS = ["All", "Open", "Closed"];

// Ghost Button reshaped into a full-width thread list row
const THREAD_ROW =
  "h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-none border-b border-surface-active px-3 py-3 text-left font-normal last:border-b-0 hover:bg-surface-hover";

const INITIAL_THREADS = [
  {
    id: 1,
    name: "Ava Cole",
    email: "ava.cole@northwind.io",
    subject: "Re: Your receipt for order #48213",
    status: "Open",
    unread: true,
    time: "14:48",
    messages: [
      { id: 1, dir: "in", from: "Ava Cole", time: "Jun 7, 14:22", body: "Hi — I was charged twice for order #48213. Can you take a look? My card shows two pending holds for $89.00." },
      { id: 2, dir: "out", from: "You (Support)", time: "Jun 7, 14:35", body: "Hi Ava, thanks for flagging this. One of those is a temporary authorization hold that drops off in 3–5 business days. I can confirm only a single charge has actually settled." },
      { id: 3, dir: "in", from: "Ava Cole", time: "Jun 7, 14:48", body: "That's a relief. Could you send me a copy of the final invoice for my records?" },
    ],
  },
  {
    id: 2,
    name: "Liam O'Brien",
    email: "liam@obrien.dev",
    subject: "Re: Summer Sale — early access",
    status: "Open",
    unread: true,
    time: "12:10",
    messages: [
      { id: 1, dir: "in", from: "Liam O'Brien", time: "Jun 7, 11:58", body: "The early-access link from your campaign email is giving me a 404. Is the sale live yet?" },
      { id: 2, dir: "out", from: "You (Support)", time: "Jun 7, 12:10", body: "Apologies for that, Liam! There was a brief redirect issue. It's fixed now — please try the button again and let me know if it still misbehaves." },
    ],
  },
  {
    id: 3,
    name: "Maria Gomez",
    email: "maria.gomez@lumen.co",
    subject: "Re: Welcome to Geiger!",
    status: "Open",
    unread: false,
    time: "Jun 6",
    messages: [
      { id: 1, dir: "in", from: "Maria Gomez", time: "Jun 6, 16:02", body: "Loving the product so far. Quick question — can I import contacts from a CSV that uses semicolons as delimiters?" },
      { id: 2, dir: "out", from: "You (Support)", time: "Jun 6, 16:40", body: "Great to hear, Maria! Yes — on the import step there's a delimiter dropdown where you can switch from comma to semicolon before mapping columns." },
      { id: 3, dir: "in", from: "Maria Gomez", time: "Jun 6, 17:15", body: "Found it, worked perfectly. Thank you!" },
      { id: 4, dir: "out", from: "You (Support)", time: "Jun 6, 17:20", body: "Wonderful — reach out any time if anything else comes up. Happy sending!" },
    ],
  },
  {
    id: 4,
    name: "Noah Schmidt",
    email: "noah.schmidt@hverk.de",
    subject: "Re: Confirm your email address",
    status: "Closed",
    unread: false,
    time: "Jun 5",
    messages: [
      { id: 1, dir: "in", from: "Noah Schmidt", time: "Jun 5, 09:30", body: "I never received the confirmation email. Can you resend it to this address?" },
      { id: 2, dir: "out", from: "You (Support)", time: "Jun 5, 09:52", body: "Resent it just now — it sometimes lands in Promotions. Let me know if it doesn't arrive within ten minutes." },
      { id: 3, dir: "in", from: "Noah Schmidt", time: "Jun 5, 10:05", body: "Got it and confirmed. Cheers." },
    ],
  },
  {
    id: 5,
    name: "Jordan Lee",
    email: "jordan.lee@brightpath.app",
    subject: "Re: Your subscription renews soon",
    status: "Closed",
    unread: false,
    time: "Jun 3",
    messages: [
      { id: 1, dir: "in", from: "Jordan Lee", time: "Jun 3, 13:11", body: "I'd like to switch from the monthly to the annual plan before this renewal. How do I do that?" },
      { id: 2, dir: "out", from: "You (Support)", time: "Jun 3, 13:40", body: "Happy to help — I've applied the annual plan and prorated the difference as a credit. Your next invoice reflects the new rate." },
    ],
  },
];

export function ConversationsScreen() {
  const [threads, setThreads] = useState(INITIAL_THREADS);
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedId, setSelectedId] = useState(1);
  const [draft, setDraft] = useState("");

  const filtered = useMemo(
    () => threads.filter((t) => statusFilter === "All" || t.status === statusFilter),
    [threads, statusFilter],
  );

  const selected = threads.find((t) => t.id === selectedId) || null;

  const openThread = (id) => {
    setSelectedId(id);
    setThreads((p) => p.map((t) => (t.id === id ? { ...t, unread: false } : t)));
  };

  const sendReply = () => {
    const body = draft.trim();
    if (!body || !selected) return;
    const msg = { id: Date.now(), dir: "out", from: "You (Support)", time: "Now", body };
    setThreads((p) => p.map((t) => (t.id === selected.id ? { ...t, messages: [...t.messages, msg], time: "Now" } : t)));
    setDraft("");
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Conversations"
        description="Reply to customer email replies and inbound messages in one shared inbox."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Thread list */}
        <div className="flex flex-col gap-3">
          <SegmentedTabs tabs={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} fullWidth />

          <SectionCard bodyPadding={false}>
            {filtered.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant="ghost"
                onClick={() => openThread(t.id)}
                className={cn(THREAD_ROW, selectedId === t.id && "bg-surface-card")}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-active text-xs font-medium text-muted-foreground">
                  {t.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">{t.name}</span>
                    <span className="shrink-0 text-xs text-text-secondary">{t.time}</span>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{t.subject}</span>
                  <span className="truncate text-xs text-text-secondary">
                    {t.messages[t.messages.length - 1].body}
                  </span>
                </div>
                {t.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400" />}
              </Button>
            ))}
            {filtered.length === 0 && <EmptyState icon={Mail} title="No conversations found." />}
          </SectionCard>
        </div>

        {/* Open conversation */}
        <SectionCard
          className="h-[560px]"
          bodyPadding={false}
          contentClassName="flex min-h-0 flex-1 flex-col"
          title={selected ? <span className="block truncate normal-case">{selected.subject}</span> : null}
          description={
            selected ? (
              <span className="inline-flex items-center gap-1.5 truncate text-xs">
                <Mail className="h-3.5 w-3.5" /> {selected.name} · {selected.email}
              </span>
            ) : null
          }
          action={selected ? <Badge variant={selected.status === "Open" ? "success" : "neutral"}>{selected.status}</Badge> : null}
        >
          {selected ? (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {selected.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-lg border border-border p-4",
                      m.dir === "out" ? "bg-surface-card" : "bg-background",
                    )}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{m.from}</span>
                      <span className="text-xs text-text-secondary">{m.time}</span>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{m.body}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-surface-active p-3">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Reply to ${selected.name}…`}
                  className="resize-none bg-background"
                />
                <div className="mt-2 flex justify-end">
                  <Button onClick={sendReply} disabled={!draft.trim()}>
                    <Send className="h-4 w-4" /> Send reply
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState icon={Mail} title="Select a conversation to read it." className="flex-1" />
          )}
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default ConversationsScreen;
