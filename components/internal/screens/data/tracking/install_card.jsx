"use client";

import React, { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button, SectionCard, SegmentedTabs, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui";
import { CodeBlock } from "../shared/code_block";
import { appBaseUrl } from "../shared/format";

const TABS = [
  { value: "browser", label: "Website snippet" },
  { value: "server", label: "Server API" },
];

export function snippetFor(base, key) {
  return `<script>
  !function(w,d){var g=w.geiger=w.geiger||[];if(g.__loaded)return;["init","identify","track","page","reset"].forEach(function(m){g[m]=g[m]||function(){g.push([m].concat([].slice.call(arguments)))}});var s=d.createElement("script");s.async=1;s.src="${base}/sdk/v1.js";d.head.appendChild(s)}(window,document);
  geiger.init("${key}");
</script>`;
}

const USAGE = `// Link this browser to a contact (creates the contact if it's new)
geiger.identify({ email: "jane@example.com", firstName: "Jane", plan: "pro" });

// Anything worth reacting to
geiger.track("product_viewed", { id: "SKU-4821", price: 149 });
geiger.track("order_completed", { order_id: "1043" }, { revenue: 129, currency: "USD" });

// Page views are sent automatically, including history navigation in single-page apps.`;

// How to send events: the browser snippet with this project's public key, or the server API.
export function InstallCard({ publicKeys, selectedKeyId, onSelectKey, onCreateKey, creatingKey, canCreateKey }) {
  const [tab, setTab] = useState("browser");
  const base = appBaseUrl();
  const key = publicKeys.find((k) => k.id === selectedKeyId) || publicKeys[0] || null;

  const serverExample = `curl -X POST ${base}/api/v1/events \\
  -H "Authorization: Bearer gck_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "events": [
      { "name": "order_completed", "email": "jane@example.com", "revenue": 129, "currency": "USD", "properties": { "order_id": "1043" } }
    ]
  }'`;

  return (
    <SectionCard
      title="Send events"
      description="Install the snippet on your site, or send events from your servers. Both land in the same stream."
      action={<SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />}
      contentClassName="space-y-4"
    >
      {tab === "browser" ? (
        key ? (
          <>
            {publicKeys.length > 1 ? (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span>Public key</span>
                <Select value={key.id} onValueChange={onSelectKey}>
                  <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>{publicKeys.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-sm text-text-secondary">Paste before <span className="font-mono">&lt;/head&gt;</span> on every page:</p>
              <CodeBlock code={snippetFor(base, key.displayKey || key.prefix)} label="Copy snippet" />
            </div>
            <div>
              <p className="mb-2 text-sm text-text-secondary">Then call it wherever something happens:</p>
              <CodeBlock code={USAGE} label="Copy example" />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-surface-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
              <p className="text-sm text-text-secondary">
                The snippet needs a public key — it can only send events, so it&apos;s safe to put in page source.
                {canCreateKey ? "" : " Ask someone who can manage integrations to create one in API Keys."}
              </p>
            </div>
            {canCreateKey ? (
              <Button size="sm" onClick={onCreateKey} disabled={creatingKey}>
                {creatingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                Create public key
              </Button>
            ) : null}
          </div>
        )
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            Use a secret key with the <span className="font-mono">events:write</span> scope from API Keys. Send up to 100 events per request; match contacts by
            <span className="font-mono"> contact_id</span>, <span className="font-mono">email</span>, <span className="font-mono">phone</span> or
            <span className="font-mono"> anonymous_id</span>.
          </p>
          <CodeBlock code={serverExample} label="Copy request" />
        </>
      )}
    </SectionCard>
  );
}

export default InstallCard;
