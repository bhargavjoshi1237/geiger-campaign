"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@geiger/ui";

// Rendered email in a sandboxed iframe (no scripts; same-origin only so the parent can size it to its content).

export const DEVICE_WIDTH = { desktop: 680, mobile: 390 };

export const DEVICE_TABS = [
  { value: "desktop", icon: Monitor, label: <span className="sr-only">Desktop</span> },
  { value: "mobile", icon: Smartphone, label: <span className="sr-only">Mobile</span> },
];

// Links open nowhere inside the sandbox (no popups allowed), so a stray click can't navigate the preview.
function withBaseTarget(html) {
  const doc = String(html || "");
  return doc.includes("<head>") ? doc.replace("<head>", '<head><base target="_blank">') : doc;
}

export function EmailPreviewFrame({ html, device = "desktop", width, minHeight = 420, title = "Email preview", className }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(minHeight);
  const srcDoc = useMemo(() => withBaseTarget(html), [html]);

  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc?.documentElement) return;
    setHeight(Math.max(minHeight, doc.documentElement.scrollHeight));
  }, [minHeight]);

  const onLoad = useCallback(() => {
    measure();
    const doc = ref.current?.contentDocument;
    for (const img of doc?.images || []) if (!img.complete) img.addEventListener("load", measure, { once: true });
  }, [measure]);

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      onLoad={onLoad}
      style={{ width: width || DEVICE_WIDTH[device] || DEVICE_WIDTH.desktop, height }}
      className={cn("mx-auto block max-w-full rounded-lg border border-border bg-white", className)}
    />
  );
}

// A scaled, non-interactive snapshot for cards and lists.
export function EmailThumbnail({ html, height = 176, className }) {
  const scale = 0.34;
  return (
    <div className={cn("pointer-events-none relative overflow-hidden bg-white", className)} style={{ height }} aria-hidden="true">
      {html ? (
        <iframe
          title="Email thumbnail"
          tabIndex={-1}
          sandbox=""
          srcDoc={html}
          loading="lazy"
          style={{ width: 640, height: height / scale, transform: `scale(${scale})`, transformOrigin: "top left" }}
          className="absolute left-1/2 top-0 -ml-[108.8px] border-0"
        />
      ) : null}
    </div>
  );
}

export default EmailPreviewFrame;
