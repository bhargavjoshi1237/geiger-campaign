"use client";

import React, { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_header";
import { Pill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const QUICK_REPLIES = [
  "Thanks for reaching out!",
  "Let me check on that.",
  "Your order is on the way 🚚",
  "Is there anything else I can help with?",
];

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
    <MainScreenWrapper className="dark">
      <ScreenHeader
        title="WhatsApp Inbox"
        description="Manage WhatsApp Business conversations and quick replies."
      />

      <div className="grid grid-cols-1 gap-4 border-t border-[#242424] pt-4 lg:grid-cols-[320px_1fr]">
        {/* Thread list */}
        <div className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1a1a1a]">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openThread(t.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-[#242424] px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-[#1d1d1d]",
                selectedId === t.id && "bg-[#202020]",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#242424] text-xs font-medium text-[#a3a3a3]">
                {t.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-[#ededed]">{t.name}</span>
                  <span className="shrink-0 text-xs text-[#737373]">{t.time}</span>
                </div>
                <span className="truncate font-mono text-xs text-[#a3a3a3]">{t.phone}</span>
                <span className="truncate text-xs text-[#737373]">{t.messages[t.messages.length - 1].body}</span>
              </div>
              {t.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}
            </button>
          ))}
        </div>

        {/* Conversation */}
        <div className="flex h-[560px] flex-col rounded-xl border border-[#2a2a2a] bg-[#1a1a1a]">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-[#242424] px-5 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-[#ededed]">{selected.name}</span>
                  <span className="inline-flex items-center gap-1.5 truncate font-mono text-xs text-[#737373]">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp · {selected.phone}
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
                        m.dir === "out" ? "bg-emerald-500/15 text-emerald-50" : "bg-[#242424] text-[#ededed]",
                      )}
                    >
                      {m.body}
                    </div>
                    <span className="mt-1 px-1 text-[10px] text-[#737373]">{m.time}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-[#242424] p-3">
                <div className="mb-2 flex flex-wrap gap-2">
                  {QUICK_REPLIES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      className="rounded-full border border-[#2a2a2a] bg-[#202020] px-3 py-1 text-xs text-[#a3a3a3] transition-colors hover:border-[#474747] hover:text-[#ededed]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                    placeholder="Type a message…"
                    className="border-[#2a2a2a] bg-[#161616]"
                  />
                  <Button onClick={() => send()} disabled={!draft.trim()} size="icon" className="h-9 w-9 shrink-0 bg-white text-black hover:bg-[#e5e5e5]">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-[#737373]">
              Select a thread to view messages.
            </div>
          )}
        </div>
      </div>
    </MainScreenWrapper>
  );
}

export default WhatsappInboxScreen;
