"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Bug, Loader2, Send } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@geiger/ui";
import { CodeBlock } from "../shared/code_block";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TYPES = [
  { value: "track", label: "track — a custom event" },
  { value: "page", label: "page — a page view" },
  { value: "identify", label: "identify — link to a contact" },
];

// Sends a real event through POST /api/public/track with the public key and shows the exact request and response.
export function TrackingDebugger({ publicKey }) {
  const [type, setType] = useState("track");
  const [name, setName] = useState("debugger_test");
  const [email, setEmail] = useState("");
  const [anonymousId, setAnonymousId] = useState("");
  const [properties, setProperties] = useState('{\n  "source": "debugger"\n}');
  const [sending, setSending] = useState(false);
  const [exchange, setExchange] = useState(null);

  if (!publicKey) {
    return (
      <EmptyState
        icon={Bug}
        title="No public key yet"
        description="The debugger sends events the same way the snippet does, so it needs a public key. Create one above."
        className="rounded-xl border border-border bg-surface-subtle"
      />
    );
  }

  const send = async () => {
    let props = {};
    try {
      props = properties.trim() ? JSON.parse(properties) : {};
    } catch {
      toast.error("Properties must be valid JSON.");
      return;
    }
    const anon = anonymousId.trim() || `debugger-${crypto.randomUUID().slice(0, 8)}`;
    if (anon !== anonymousId) setAnonymousId(anon);
    const event =
      type === "identify"
        ? { type, anonymousId: anon, traits: { email: email.trim(), ...props } }
        : type === "page"
          ? { type, anonymousId: anon, properties: props, url: typeof window !== "undefined" ? window.location.href : undefined, title: "Debugger" }
          : { type, event: name.trim(), anonymousId: anon, properties: props };
    if (type === "track" && !event.event) {
      toast.error("Give the event a name.");
      return;
    }
    if (type === "identify" && !email.trim()) {
      toast.error("identify needs an email.");
      return;
    }
    const body = { key: publicKey, library: "geiger-debugger", batch: [{ ...event, timestamp: new Date().toISOString(), messageId: crypto.randomUUID() }] };
    setSending(true);
    const started = performance.now();
    let response;
    try {
      const res = await fetch(`${BASE_PATH}/api/public/track`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) });
      const text = await res.text();
      let parsed = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep raw text
      }
      response = { status: res.status, ok: res.ok, body: parsed, ms: Math.round(performance.now() - started) };
    } catch (e) {
      response = { status: 0, ok: false, body: e?.message || "Network error", ms: Math.round(performance.now() - started) };
    }
    setSending(false);
    setExchange({ request: { ...body, key: `${publicKey.slice(0, 12)}…` }, response });
    if (response.ok && !response.body?.rejected?.length) toast.success("Event accepted — it appears in the live stream within seconds.");
    else toast.error(response.body?.rejected?.[0]?.error || response.body?.error || `Request failed (${response.status}).`);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Send a test event" description="Goes through the real ingest endpoint with your public key." contentClassName="space-y-4">
        <Field label="Call">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {type === "track" ? (
          <Field label="Event name" htmlFor="dbg-name">
            <Input id="dbg-name" value={name} onChange={(e) => setName(e.target.value)} className="font-mono" />
          </Field>
        ) : null}
        {type === "identify" ? (
          <Field label="Email" htmlFor="dbg-email" hint="Creates the contact as pending if it doesn't exist, then links this anonymous id.">
            <Input id="dbg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
          </Field>
        ) : null}
        <Field label="Anonymous id" htmlFor="dbg-anon" hint="Reuse it across sends to see identify attribute earlier events.">
          <Input id="dbg-anon" value={anonymousId} onChange={(e) => setAnonymousId(e.target.value)} placeholder="Generated on first send" className="font-mono text-sm" />
        </Field>
        <Field label={type === "identify" ? "Traits (JSON)" : "Properties (JSON)"} htmlFor="dbg-props">
          <Textarea id="dbg-props" value={properties} onChange={(e) => setProperties(e.target.value)} rows={5} className="font-mono text-xs" />
        </Field>
        <Button onClick={send} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send event
        </Button>
      </SectionCard>

      <SectionCard
        title="Request & response"
        action={exchange ? <Badge variant={exchange.response.ok ? "success" : "danger"}>{exchange.response.status || "Network error"} · {exchange.response.ms} ms</Badge> : null}
        contentClassName="space-y-4"
      >
        {exchange ? (
          <>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">POST {BASE_PATH}/api/public/track</p>
              <CodeBlock code={JSON.stringify(exchange.request, null, 2)} maxHeight="max-h-64" />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Response</p>
              <CodeBlock code={typeof exchange.response.body === "string" ? exchange.response.body : JSON.stringify(exchange.response.body, null, 2)} maxHeight="max-h-64" />
            </div>
          </>
        ) : (
          <p className="text-sm text-text-secondary">Send an event to see exactly what was posted and what the endpoint answered.</p>
        )}
      </SectionCard>
    </div>
  );
}

export default TrackingDebugger;
