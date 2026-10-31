"use client";

import React, { useState } from "react";
import { SegmentedTabs } from "@geiger/ui";
import { CodeBlock } from "@/components/internal/screens/data/shared/code_block";

const NODE = `import crypto from "node:crypto";

// rawBody: the exact request body string (before JSON.parse)
// header:  req.headers["x-geiger-signature"]  ->  "t=1730000000,v1=5f3a…"
export function verifyGeigerSignature(rawBody, header, secret, toleranceSeconds = 300) {
  const items = String(header || "").split(",").map((part) => part.trim().split("="));
  const t = Number(items.find(([k]) => k === "t")?.[1]);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  // During a secret rotation the header carries one v1 per live secret.
  return items.some(([k, v]) =>
    k === "v1" && v.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected)));
}`;

const PYTHON = `import hashlib, hmac, time

# raw_body: the exact request body bytes; header: request.headers["X-Geiger-Signature"]
def verify_geiger_signature(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    items = [part.strip().split("=", 1) for part in (header or "").split(",")]
    t = next((int(v) for k, v in items if k == "t" and v.isdigit()), 0)
    if not t or abs(time.time() - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return any(k == "v1" and hmac.compare_digest(v, expected) for k, v in items)`;

const TABS = [
  { value: "node", label: "Node.js" },
  { value: "python", label: "Python" },
];

// How receivers verify X-Geiger-Signature, with copyable sample code.
export function SignatureDocs({ headers = [] }) {
  const [lang, setLang] = useState("node");
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-secondary">
        <li>
          Read the <span className="font-mono text-foreground">X-Geiger-Signature</span> header: <span className="font-mono">t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</span>.
        </li>
        <li>
          Compute HMAC-SHA256 of <span className="font-mono">&lt;t&gt;.&lt;raw body&gt;</span> with your signing secret and compare it to each <span className="font-mono">v1</span> in constant time.
        </li>
        <li>Reject requests whose timestamp is more than five minutes old, and answer with any 2xx within 10 seconds.</li>
      </ol>
      {headers.length ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {headers.map(([name, desc]) => (
            <div key={name} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <code className="font-mono text-xs text-foreground">{name}</code>
              <span className="text-xs text-text-secondary">{desc}</span>
            </div>
          ))}
        </div>
      ) : null}
      <SegmentedTabs tabs={TABS} value={lang} onChange={setLang} />
      <CodeBlock code={lang === "node" ? NODE : PYTHON} label="Copy verification code" />
    </div>
  );
}

export default SignatureDocs;
