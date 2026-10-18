"use client";

import React, { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { Button, Input, cn, ScreenHeader, Badge, SectionCard, EmptyState } from "@geiger/ui";

const QUICK_REPLIES = [
  "Thanks for reaching out!",
  "Let me check on that.",
  "Your order is on the way 🚚",
  "Is there anything else I can help with?",
];

// Ghost Button reshaped into a full-width thread list row
const THREAD_ROW =
  "h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-none border-b border-surface-active px-3 py-3 text-left font-normal last:border-b-0 hover:bg-surface-hover";

const INITIAL_THREADS = [
  {
    id: 1,
    name: "Ava Cole",
    phone: "+1 (415) 555-0142",
    status: "Open",
    unread: true,
    time: "15:02",
    messages: [
      { id: 1, dir: "in", time: "14:55", body: "Hi! Do you ship to Canada?" },
      { id: 2, dir: "out", time: "14:57", body: "Hi Ava! Yes, we ship across Canada — delivery is usually 4–6 business days." },
      { id: 3, dir: "in", time: "15:02", body: "Amazing, placing my order now 🎉" },
    ],
  },
  {
    id: 2,
    name: "Liam O'Brien",
    phone: "+44 7700 900812",
    status: "Open",
    unread: true,
    time: "12:48",
    messages: [
      { id: 1, dir: "in", time: "12:30", body: "My discount code SUMMER20 isn't applying at checkout." },
      { id: 2, dir: "out", time: "12:48", body: "Sorry about that! SUMMER20 applies to orders over £40. Once you cross that it'll activate automatically." },
    ],
  },
  {
    id: 3,
    name: "Maria Gomez",
    phone: "+1 (212) 555-0177",
    status: "Open",
    unread: false,
    time: "10:15",
    messages: [
      { id: 1, dir: "out", time: "09:40", body: "Hi Maria, your appointment is confirmed for tomorrow at 2pm. Reply RESCHEDULE to change it." },
      { id: 2, dir: "in", time: "10:15", body: "Perfect, see you then!" },
    ],
  },
  {
    id: 4,
    name: "Noah Schmidt",
    phone: "+49 152 5550198",
    status: "Closed",
    unread: false,
    time: "Jun 6",
    messages: [
      { id: 1, dir: "in", time: "Jun 6, 17:20", body: "Is my refund processed yet?" },
      { id: 2, dir: "out", time: "Jun 6, 17:35", body: "Yes — €42.00 was refunded this afternoon. It should appear in 3–5 business days." },
      { id: 3, dir: "in", time: "Jun 6, 17:38", body: "Great, thank you 👍" },
    ],
  },
  {
    id: 5,
    name: "Priya Nair",
    phone: "+61 491 570 156",
    status: "Closed",
    unread: false,
    time: "Jun 5",
    messages: [
      { id: 1, dir: "in", time: "Jun 5, 08:10", body: "Do you have the blue version back in stock?" },
      { id: 2, dir: "out", time: "Jun 5, 08:25", body: "Not yet, but I've added you to the waitlist — you'll get a message the moment it's back." },
    ],
  },
];

export function WhatsappInboxScreen() {
  const [threads, setThreads] = useState(INITIAL_THREADS);
  const [selectedId, setSelectedId] = useState(1);
  const [draft, setDraft] = useState("");

  const selected = threads.find((t) => t.id === selectedId) || null;

  const openThread = (id) => {
    setSelectedId(id);
    setThreads((p) => p.map((t) => (t.id === id ? { ...t, unread: false } : t)));
  };

  const send = (text) => {
    const body = (text ?? draft).trim();
    if (!body || !selected) return;
    const msg = { id: Date.now(), dir: "out", time: "Now", body };
    setThreads((p) => p.map((t) => (t.id === selected.id ? { ...t, messages: [...t.messages, msg], time: "Now" } : t)));
    setDraft("");
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="WhatsApp Inbox"
        description="Manage WhatsApp Business conversations and quick replies."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Thread list */}
        <SectionCard bodyPadding={false}>
          {threads.map((t) => (
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
                <span className="truncate font-mono text-xs text-muted-foreground">{t.phone}</span>
                <span className="truncate text-xs text-text-secondary">{t.messages[t.messages.length - 1].body}</span>
              </div>
              {t.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}
            </Button>
          ))}
        </SectionCard>

        {/* Conversation */}
        <SectionCard
          className="h-[560px]"
          bodyPadding={false}
          contentClassName="flex min-h-0 flex-1 flex-col"
          title={selected ? <span className="block truncate">{selected.name}</span> : null}
          description={
            selected ? (
              <span className="inline-flex items-center gap-1.5 truncate font-mono text-xs">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp · {selected.phone}
              </span>
            ) : null
          }
          action={selected ? <Badge variant={selected.status === "Open" ? "success" : "neutral"}>{selected.status}</Badge> : null}
        >
          {selected ? (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
                {selected.messages.map((m) => (
                  <div key={m.id} className={cn("flex flex-col", m.dir === "out" ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-5",
                        m.dir === "out" ? "bg-emerald-500/15 text-emerald-900 dark:text-emerald-50" : "bg-surface-active text-foreground",
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="mt-1 px-1 text-[10px] text-text-secondary">{m.time}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-surface-active p-3">
                <div className="mb-2 flex flex-wrap gap-2">
                  {QUICK_REPLIES.map((q) => (
                    <Button
                      key={q}
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => send(q)}
                      className="rounded-full bg-surface-card px-3 font-normal text-muted-foreground shadow-none hover:border-border-strong"
                    >
                      {q}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                    placeholder="Type a message…"
                    className="border-border"
                  />
                  <Button onClick={() => send()} disabled={!draft.trim()} size="icon" aria-label="Send message">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState icon={MessageCircle} title="Select a thread to view messages." className="flex-1" />
          )}
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default WhatsappInboxScreen;
