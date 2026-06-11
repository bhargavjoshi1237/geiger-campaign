"use client";

import React, { useState } from "react";
import { Smartphone, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Pill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="SMS Inbox"
        description="Two-way SMS conversations with your contacts."
      />

      <div className="grid grid-cols-1 gap-4 border-t border-surface-active pt-4 lg:grid-cols-[320px_1fr]">
        {/* Thread list */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openThread(t.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-surface-active px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-[#1d1d1d]",
                selectedId === t.id && "bg-surface-card",
              )}
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
            </button>
          ))}
        </div>

        {/* Conversation */}
        <div className="flex h-[560px] flex-col rounded-xl border border-border bg-surface-subtle">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-surface-active px-5 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">{selected.name}</span>
                  <span className="inline-flex items-center gap-1.5 truncate font-mono text-xs text-text-secondary">
                    <Smartphone className="h-3.5 w-3.5" /> {selected.phone}
                  </span>
                </div>
                <Pill tone={selected.status === "Open" ? "green" : "zinc"}>{selected.status}</Pill>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
                {selected.messages.map((m) => (
                  <div key={m.id} className={cn("flex flex-col", m.dir === "out" ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-5",
                        m.dir === "out" ? "bg-white text-black" : "bg-surface-active text-foreground",
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
                    className="border-border bg-background"
                  />
                  <Button onClick={send} disabled={!draft.trim()} size="icon" className="h-9 w-9 shrink-0 bg-white text-black hover:bg-[#e5e5e5]">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
              Select a thread to view messages.
            </div>
          )}
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default SmsInboxScreen;
