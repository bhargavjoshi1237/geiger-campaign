"use client";

import React, { useState } from "react";
import { Smartphone, Send } from "lucide-react";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { Button, Input, cn, ScreenHeader, Badge, SectionCard, EmptyState } from "@geiger/ui";

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
    time: "14:51",
    messages: [
      { id: 1, dir: "in", time: "14:40", body: "Hey, did my order #48213 actually ship today?" },
      { id: 2, dir: "out", time: "14:44", body: "Hi Ava! Yes — it left our warehouse this morning. Tracking: 1Z99AA10." },
      { id: 3, dir: "in", time: "14:51", body: "Perfect, thanks for the quick reply 🙏" },
    ],
  },
  {
    id: 2,
    name: "Liam O'Brien",
    phone: "+44 7700 900812",
    status: "Open",
    unread: true,
    time: "13:22",
    messages: [
      { id: 1, dir: "out", time: "13:05", body: "Your Geiger verification code is 884213. It expires in 10 minutes." },
      { id: 2, dir: "in", time: "13:22", body: "Got it, thanks — code worked." },
    ],
  },
  {
    id: 3,
    name: "Maria Gomez",
    phone: "+1 (212) 555-0177",
    status: "Open",
    unread: false,
    time: "11:09",
    messages: [
      { id: 1, dir: "in", time: "10:50", body: "Can I reschedule my delivery to Friday instead?" },
      { id: 2, dir: "out", time: "10:58", body: "Of course — I've moved it to Friday between 9am and 12pm. You'll get a reminder the night before." },
      { id: 3, dir: "in", time: "11:09", body: "Brilliant, appreciate it." },
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
      { id: 1, dir: "in", time: "Jun 6, 18:30", body: "STOP" },
      { id: 2, dir: "out", time: "Jun 6, 18:30", body: "You've been unsubscribed from SMS updates. Reply START to opt back in any time." },
    ],
  },
  {
    id: 5,
    name: "Priya Nair",
    phone: "+61 491 570 156",
    status: "Closed",
    unread: false,
    time: "Jun 4",
    messages: [
      { id: 1, dir: "out", time: "Jun 4, 09:00", body: "Your subscription renews on Jun 12. Reply HELP for options." },
      { id: 2, dir: "in", time: "Jun 4, 09:14", body: "All good, keep it going." },
    ],
  },
];

export function SmsInboxScreen() {
  const [threads, setThreads] = useState(INITIAL_THREADS);
  const [selectedId, setSelectedId] = useState(1);
  const [draft, setDraft] = useState("");

  const selected = threads.find((t) => t.id === selectedId) || null;

  const openThread = (id) => {
    setSelectedId(id);
    setThreads((p) => p.map((t) => (t.id === id ? { ...t, unread: false } : t)));
  };

  const send = () => {
    const body = draft.trim();
    if (!body || !selected) return;
    const msg = { id: Date.now(), dir: "out", time: "Now", body };
    setThreads((p) => p.map((t) => (t.id === selected.id ? { ...t, messages: [...t.messages, msg], time: "Now" } : t)));
    setDraft("");
  };

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="SMS Inbox"
        description="Two-way SMS conversations with your contacts."
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
              {t.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400" />}
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
                <Smartphone className="h-3.5 w-3.5" /> {selected.phone}
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
                        m.dir === "out" ? "bg-primary text-primary-foreground dark:text-black" : "bg-surface-active text-foreground",
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="mt-1 px-1 text-[10px] text-text-secondary">{m.time}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-surface-active p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                    placeholder="Text message…"
                    className="border-border"
                  />
                  <Button onClick={send} disabled={!draft.trim()} size="icon" aria-label="Send message">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState icon={Smartphone} title="Select a thread to view messages." className="flex-1" />
          )}
        </SectionCard>
      </div>
    </MainScreenWrapper>
  );
}

export default SmsInboxScreen;
