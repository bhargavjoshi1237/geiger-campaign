"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { listConnections, normalizeConnection } from "@/lib/supabase/channel_connections";
import { socialApi } from "@/lib/social/accounts/api";

// Data hooks for the social channel screens: connections through the core data layer, the deployment's connect
// configuration, a ticking clock for window countdowns, and the OAuth return toast.

export function useSocialConnections(projectId, channels) {
  const key = channels.join(",");
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    listConnections(projectId, { channel: key.split(",") }).then((rows) => {
      if (!alive) return;
      setConnections(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, key]);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const rows = await listConnections(projectId, { channel: key.split(",") });
    if (rows) setConnections(rows);
  }, [projectId, key]);

  // Merges server rows (raw snake_case) into the list; disconnected rows drop out.
  const replace = useCallback((raw) => {
    const list = (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((r) => (r.project_id !== undefined ? normalizeConnection(r) : r));
    setConnections((prev) => {
      let next = [...prev];
      for (const row of list) {
        if (row.status === "disconnected") next = next.filter((c) => c.id !== row.id);
        else if (next.some((c) => c.id === row.id)) next = next.map((c) => (c.id === row.id ? row : c));
        else next = [...next, row];
      }
      return next;
    });
  }, []);

  const remove = useCallback((id) => setConnections((prev) => prev.filter((c) => c.id !== id)), []);

  return { connections, loading, reload, replace, remove, setConnections };
}

export function useSocialConfig(projectId) {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    socialApi.config(projectId).then((res) => alive && setConfig(res.ok ? res.data : { error: res.error }));
    return () => {
      alive = false;
    };
  }, [projectId]);
  return config;
}

export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// After an OAuth round-trip the callback lands here with ?social_connected / ?social_error; toast once, clean the URL.
export function useOAuthReturn(onConnected) {
  const handled = useRef(false);
  const callback = useRef(onConnected);
  useEffect(() => {
    callback.current = onConnected;
  }, [onConnected]);
  useEffect(() => {
    if (handled.current || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const connected = url.searchParams.get("social_connected");
    const error = url.searchParams.get("social_error");
    const notes = url.searchParams.get("social_notes");
    if (!connected && !error) return;
    handled.current = true;
    if (connected) {
      toast.success(`Connected ${connected} account${connected === "1" ? "" : "s"}.`, notes ? { description: notes } : undefined);
      callback.current?.();
    } else toast.error(error);
    for (const key of ["social_connected", "social_error", "social_notes"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);
}
