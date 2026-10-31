"use client";

import React from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button, cn } from "@geiger/ui";
import { copyText } from "./format";

// Monospace snippet with a copy button; used for install snippets, API examples and payloads.
export function CodeBlock({ code, label = "Copy code", className, maxHeight = "max-h-96" }) {
  return (
    <div className={cn("relative", className)}>
      <pre className={cn("overflow-auto rounded-lg border border-border bg-background p-4 pr-12 font-mono text-xs leading-relaxed text-muted-foreground", maxHeight)}>
        {code}
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        onClick={() => copyText(code, toast)}
        className="absolute right-2 top-2 text-muted-foreground hover:bg-surface-active hover:text-foreground"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// A secret shown once (API key, signing secret) with copy, and a reminder it won't be shown again.
export function SecretValue({ value, label = "Copy" }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-card px-3 py-2.5">
      <code className="min-w-0 flex-1 break-all font-mono text-sm text-foreground">{value}</code>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={() => copyText(value, toast)} className="shrink-0 text-muted-foreground hover:bg-surface-active hover:text-foreground">
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default CodeBlock;
