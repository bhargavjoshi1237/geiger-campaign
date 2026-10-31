"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listContacts } from "@/lib/supabase/contacts";
import { listConnections } from "@/lib/supabase/channel_connections";
import { listDeliveries } from "@/lib/supabase/deliveries";
import { listMembers } from "@/lib/supabase/rbac";
import { listSavedReplies } from "@/lib/supabase/saved_replies";
import { getUser } from "@/lib/supabase/user";
import {
  listConversations,
  listMessages,
  listRecentMessages,
  updateConversation,
} from "@/lib/supabase/conversations";

// Inbox data hooks: a ticking clock, visibility-aware polling (~10s, no websockets), the workspace's
// conversations + lookups, and one thread's messages with delivery ticks.

export const POLL_MS = 10_000;

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// Calls fn every intervalMs while the tab is visible, and once when it becomes visible again.
export function useVisiblePoll(fn, intervalMs = POLL_MS, enabled = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    const run = () => {
      if (document.visibilityState === "visible") ref.current?.();
    };
    const timer = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs, enabled]);
}

const latest = (rows) => rows.reduce((max, m) => (m.sentAt && m.sentAt > max ? m.sentAt : max), "");

// Previews + a lowercase search haystack per conversation, from the newest messages first.
function indexMessages(messages, prev = new Map()) {
  const next = new Map(prev);
  for (const m of [...messages].sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)))) {
    const entry = next.get(m.conversationId) || { preview: null, text: "" };
    const body = m.body || (m.attachments?.length ? `${m.attachments.length} attachment${m.attachments.length === 1 ? "" : "s"}` : "");
    next.set(m.conversationId, {
      preview: { body, direction: m.direction, senderType: m.senderType, sentAt: m.sentAt },
      text: `${entry.text} ${String(m.body || "").toLowerCase()}`.slice(-4000),
    });
  }
  return next;
}

// Everything an inbox screen renders: conversations in scope, contacts/members/replies lookups, previews.
export function useInboxData({ projectId, channels = null, kind = null, poll = true }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [members, setMembers] = useState([]);
  const [savedReplies, setSavedReplies] = useState([]);
  const [connections, setConnections] = useState([]);
  const [me, setMe] = useState(null);
  const [messageIndex, setMessageIndex] = useState(() => new Map());
  const cursor = useRef("");
  const scope = JSON.stringify({ channels, kind });

  const fetchConversations = useCallback(async () => {
    const { channels: ch, kind: k } = JSON.parse(scope);
    // "dm" scopes are narrowed client-side (anything that isn't a comment), so only comments filter here.
    return listConversations(projectId, { channel: ch || undefined, kind: k === "comment" ? "comment" : undefined, limit: 1000 });
  }, [projectId, scope]);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([
      fetchConversations(),
      listRecentMessages(projectId, { limit: 3000 }),
      listContacts(projectId, { limit: 2000 }),
      listMembers(projectId),
      listSavedReplies(projectId),
      listConnections(projectId),
      getUser(),
    ]).then(([rows, recent, contactRows, memberRows, replies, conns, user]) => {
      if (!alive) return;
      setConversations(rows ?? []);
      setFailed(rows === null);
      setMessageIndex(indexMessages(recent ?? []));
      cursor.current = latest(recent ?? []);
      setContacts(contactRows ?? []);
      setMembers(memberRows ?? []);
      setSavedReplies(replies ?? []);
      setConnections(conns ?? []);
      setMe(user);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, fetchConversations]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [rows, recent] = await Promise.all([
      fetchConversations(),
      listRecentMessages(projectId, { since: cursor.current || undefined, limit: 500 }),
    ]);
    if (rows) {
      setConversations(rows);
      // Snoozes that ran out reopen; the write is idempotent so concurrent tabs agree.
      const nowIso = new Date().toISOString();
      for (const c of rows) {
        if (c.status === "snoozed" && c.snoozedUntil && c.snoozedUntil <= nowIso) {
          updateConversation(c.id, { status: "open", snoozedUntil: null });
        }
      }
    }
    if (recent?.length) {
      setMessageIndex((prev) => indexMessages(recent, prev));
      cursor.current = latest(recent) || cursor.current;
    }
  }, [projectId, fetchConversations]);

  useVisiblePoll(refresh, POLL_MS, poll && !loading);

  const contactsById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const membersById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);

  const patchLocal = useCallback((id, patch) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);
  const replaceLocal = useCallback((row) => {
    if (!row) return;
    setConversations((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...row } : c)));
  }, []);
  const removeLocal = useCallback((id) => setConversations((prev) => prev.filter((c) => c.id !== id)), []);
  const notePreview = useCallback((message) => {
    if (message) setMessageIndex((prev) => indexMessages([message], prev));
  }, []);

  return {
    loading,
    failed,
    conversations,
    contacts,
    contactsById,
    members,
    membersById,
    savedReplies,
    setSavedReplies,
    connections,
    me,
    messageIndex,
    refresh,
    patchLocal,
    replaceLocal,
    removeLocal,
    notePreview,
  };
}

const TICK_RANK = { failed: -1, received: 0, queued: 1, sent: 2, delivered: 3, opened: 4, clicked: 4, read: 4, replied: 4 };

// Best-known status: the message row or its delivery log row, whichever got further.
function mergeStatus(message, delivery) {
  if (!delivery) return message.status;
  if (delivery.status === "failed" || delivery.status === "bounced") return "failed";
  const d = delivery.status === "opened" || delivery.status === "clicked" || delivery.status === "replied" ? "read" : delivery.status;
  return (TICK_RANK[d] ?? 0) > (TICK_RANK[message.status] ?? 0) ? d : message.status;
}

// One thread: messages (+ delivery ticks from campaign.deliveries), polled while visible.
export function useThread(projectId, conversationId) {
  const [messages, setMessages] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedFor, setLoadedFor] = useState(conversationId);

  if (loadedFor !== conversationId) {
    setLoadedFor(conversationId);
    setMessages([]);
    setDeliveries([]);
    setLoading(true);
  }

  const load = useCallback(async () => {
    if (!conversationId) return null;
    const [rows, logs] = await Promise.all([
      listMessages(conversationId),
      listDeliveries(projectId, { sourceType: "inbox", sourceId: conversationId, limit: 500 }),
    ]);
    return { rows: rows ?? [], logs: logs ?? [] };
  }, [projectId, conversationId]);

  useEffect(() => {
    let alive = true;
    load().then((out) => {
      if (!alive || !out) return;
      setMessages(out.rows);
      setDeliveries(out.logs);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    const out = await load();
    if (!out) return;
    // Keep optimistic rows the server doesn't know about yet.
    setMessages((prev) => {
      const known = new Set(out.rows.map((m) => m.id));
      return [...out.rows, ...prev.filter((m) => m.pending && !known.has(m.id))];
    });
    setDeliveries(out.logs);
  }, [load]);

  useVisiblePoll(refresh, POLL_MS, Boolean(conversationId) && !loading);

  const deliveriesById = useMemo(() => new Map(deliveries.map((d) => [d.id, d])), [deliveries]);
  const withTicks = useMemo(
    () => messages.map((m) => (m.direction === "outbound" ? { ...m, status: mergeStatus(m, deliveriesById.get(m.deliveryId)) } : m)),
    [messages, deliveriesById],
  );

  return { messages: withTicks, loading, setMessages, refresh };
}
