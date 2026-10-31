"use client";

import React, { useEffect, useRef, useState } from "react";
import { Pause, Play, Radio } from "lucide-react";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  LoadingArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@geiger/ui";
import { listTrackedEvents } from "@/lib/supabase/tracked_events";
import { contactLabels } from "@/lib/supabase/event_definitions";
import { CodeBlock } from "../shared/code_block";
import { formatDateTime, OUTLINE_BUTTON, relativeTime } from "../shared/format";

const POLL_MS = 5000;

function pathOf(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url || "—";
  }
}

// The newest tracked events, refreshed every few seconds while visible; a row opens its full payload.
export function LiveStream({ projectId, name = null, compact = false }) {
  const [events, setEvents] = useState([]);
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState(null);
  const labelsRef = useRef({});

  useEffect(() => {
    if (paused) return undefined;
    let alive = true;
    const load = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const rows = await listTrackedEvents(projectId, { limit: compact ? 20 : 100, ...(name ? { name } : {}) });
      if (!alive) return;
      setEvents(rows ?? []);
      setLoading(false);
      const missing = [...new Set((rows || []).map((e) => e.contactId).filter((id) => id && !labelsRef.current[id]))];
      if (missing.length) {
        const found = await contactLabels(projectId, missing);
        if (!alive) return;
        labelsRef.current = { ...labelsRef.current, ...found };
        setLabels(labelsRef.current);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [projectId, name, paused, compact]);

  const who = (e) => {
    if (e.contactId) return labels[e.contactId]?.email || labels[e.contactId]?.name || "Contact";
    return e.anonymousId ? `Anonymous ${e.anonymousId.slice(0, 8)}` : "Unknown";
  };

  const columns = [
    { key: "time", header: "Time", className: "whitespace-nowrap tabular-nums text-muted-foreground", render: (e) => <span title={formatDateTime(e.occurredAt)}>{relativeTime(e.occurredAt)}</span> },
    ...(name ? [] : [{ key: "name", header: "Event", className: "font-mono text-foreground", render: (e) => e.name }]),
    {
      key: "who",
      header: "Who",
      className: "max-w-[220px] truncate",
      render: (e) => <span className={e.contactId ? "text-foreground" : "text-text-secondary"}>{who(e)}</span>,
    },
    { key: "source", header: "Source", render: (e) => <Badge variant="neutral">{e.source}</Badge> },
    { key: "url", header: "Page", className: "max-w-[240px] truncate text-muted-foreground", render: (e) => pathOf(e.url) },
    { key: "revenue", header: "Revenue", align: "right", className: "tabular-nums text-muted-foreground", render: (e) => (e.revenue != null ? `${e.revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${e.currency || ""}` : "—") },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Radio className={paused ? "h-4 w-4" : "h-4 w-4 text-emerald-600 dark:text-emerald-400"} />
          {paused ? "Paused" : `Refreshing every ${POLL_MS / 1000}s`} · newest {compact ? 20 : 100}
        </p>
        <Button variant="outline" size="sm" className={OUTLINE_BUTTON} onClick={() => setPaused((p) => !p)}>
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>
      {loading ? (
        <LoadingArea size={44} panel label="Loading events" />
      ) : (
        <DataTable
          columns={columns}
          data={events}
          getRowKey={(e) => e.id}
          onRowClick={setSelected}
          empty={
            <EmptyState
              icon={Radio}
              title="No events yet"
              description={name ? "This event hasn't been received yet." : "Install the snippet or send a test from the debugger — events show up here within seconds."}
              className="rounded-xl border border-border bg-surface-subtle"
            />
          }
        />
      )}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-mono">{selected?.name}</SheetTitle>
            <SheetDescription>{selected ? `${formatDateTime(selected.occurredAt)} · ${who(selected)} · ${selected.source}` : ""}</SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="px-4 pb-6">
              <CodeBlock
                maxHeight="max-h-[70vh]"
                code={JSON.stringify(
                  {
                    id: selected.id,
                    name: selected.name,
                    occurred_at: selected.occurredAt,
                    contact_id: selected.contactId,
                    anonymous_id: selected.anonymousId,
                    source: selected.source,
                    properties: selected.properties,
                    revenue: selected.revenue,
                    currency: selected.currency,
                    url: selected.url || null,
                    referrer: selected.referrer || null,
                    utm: selected.utm,
                    campaign_id: selected.campaignId,
                  },
                  null,
                  2,
                )}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default LiveStream;
