"use client";

import { useEffect } from "react";

// Counts one view per browser session for a hosted page by POSTing to `path` (with the page's UTM).
export function ViewBeacon({ path, sessionKey }) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, "1");
    } catch {
      // Storage blocked: count the view anyway.
    }
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    fetch(`${base}${path}`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: window.location.href, referrer: document.referrer || "" }),
    }).catch(() => {});
  }, [path, sessionKey]);
  return null;
}

export default ViewBeacon;
